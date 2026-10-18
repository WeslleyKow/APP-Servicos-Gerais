import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAppSecret, pool, query } from './db';
import { addMonth, nextDueAfterPayment, todaySP } from './billing';

// Integração com o Mercado Pago (Pix). A confirmação vem pelo webhook e também é conferida
// ativamente enquanto o cliente está na tela do QR Code — o pagamento nunca depende só do aviso.

const MP_BASE = () => (process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com').replace(/\/$/, '');
const token = () => process.env.MERCADOPAGO_ACCESS_TOKEN || '';
export const mpConfigured = () => !!token();
const CHARGE_MINUTES = 30;

export class PaymentError extends Error {}

type MpPayment = {
  id: number | string;
  status: string;
  transaction_amount: number;
  external_reference?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
};

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(MP_BASE() + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = JSON.stringify({ status: res.status, message: body?.message, error: body?.error, cause: body?.cause }).slice(0, 800);
    console.error('Mercado Pago respondeu', detail);
    await query("insert into app_meta (key, value) values ('mp_last_error', $1) on conflict (key) do update set value = excluded.value", [new Date().toISOString() + ' ' + detail]).catch(() => {});
    throw new PaymentError(friendlyMpError(res.status, JSON.stringify(body)));
  }
  return body as T;
}

function friendlyMpError(status: number, raw: string): string {
  const t = raw.toLowerCase();
  if (status === 401 || t.includes('invalid access token') || t.includes('unauthorized')) return 'Pagamento indisponível: a chave do Mercado Pago está inválida. Avise o suporte.';
  if (t.includes('key enabled') || t.includes('financial identity') || t.includes('qr render')) return 'Pagamento indisponível: a conta do Mercado Pago ainda não tem chave Pix cadastrada. Avise o suporte.';
  return 'O Mercado Pago não respondeu como esperado. Tente novamente em instantes.';
}

/** Último erro devolvido pelo Mercado Pago (para diagnóstico, sem dados sensíveis). */
export async function lastMpError(): Promise<string | null> {
  const r = await query<{ value: string }>("select value from app_meta where key = 'mp_last_error'");
  return r.rows[0]?.value ?? null;
}

// ---------- Token para pagar a partir da tela de login (cliente bloqueado não tem sessão) ----------

export async function signPayToken(accountId: string, minutes = 30): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + minutes * 60;
  const payload = `${accountId}.${exp}`;
  const sig = createHmac('sha256', await getAppSecret()).update('pay:' + payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function verifyPayToken(tokenValue: unknown): Promise<string | null> {
  if (typeof tokenValue !== 'string') return null;
  const parts = tokenValue.split('.');
  if (parts.length !== 3) return null;
  const [accountId, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const expected = createHmac('sha256', await getAppSecret()).update(`pay:${accountId}.${exp}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? accountId : null;
}

// ---------- Cobranças ----------

export type Charge = { id: string; amount: number; status: string; qr_code: string; qr_base64: string; ticket_url: string; expires_at: string };

type AccountBilling = { id: string; business_name: string; status: string; monthly_fee: number | null; contact_email: string; username: string | null };

async function accountForCharge(accountId: string): Promise<AccountBilling> {
  const r = await query<AccountBilling>(
    `select a.id, a.business_name, a.status, a.monthly_fee, a.contact_email,
            (select username from users where account_id = a.id and role = 'client' order by created_at limit 1) as username
       from accounts a where a.id = $1`,
    [accountId],
  );
  const acc = r.rows[0];
  if (!acc) throw new PaymentError('Conta não encontrada.');
  if (acc.status !== 'ativo' && acc.status !== 'pendente') throw new PaymentError('Seu acesso foi suspenso pelo administrador. Entre em contato com o suporte.');
  if (!acc.monthly_fee || acc.monthly_fee <= 0) throw new PaymentError('Sua mensalidade ainda não foi definida. Fale com o suporte.');
  return acc;
}

/** Devolve um Pix pendente ainda válido ou cria um novo no Mercado Pago. */
export async function getOrCreateCharge(accountId: string, origin: string): Promise<Charge> {
  if (!mpConfigured()) throw new PaymentError('O pagamento online ainda não está disponível. Fale com o suporte.');
  const acc = await accountForCharge(accountId);
  const existing = await query<Charge>(
    "select id, amount, status, qr_code, qr_base64, ticket_url, expires_at from billing_charges where account_id = $1 and status = 'pending' and amount = $2 and expires_at > now() + interval '3 minutes' order by created_at desc limit 1",
    [accountId, acc.monthly_fee],
  );
  if (existing.rows[0]) return existing.rows[0];

  const id = randomUUID();
  const expires = new Date(Date.now() + CHARGE_MINUTES * 60_000);
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(acc.contact_email) ? acc.contact_email : `${(acc.username || 'cliente').replace(/[^a-z0-9._-]/gi, '')}@clientes.painelgeral.app`;
  const isPublic = /^https:\/\//.test(origin);
  const payment = await mp<MpPayment>('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': id },
    body: JSON.stringify({
      transaction_amount: acc.monthly_fee,
      description: `Mensalidade Painel Geral - ${acc.business_name}`.slice(0, 120),
      payment_method_id: 'pix',
      external_reference: id,
      date_of_expiration: new Date(expires.getTime() - 3 * 3600_000).toISOString().replace('Z', '-03:00'),
      payer: { email },
      ...(isPublic ? { notification_url: origin + '/api/pagamentos/webhook' } : {}),
    }),
  });
  const td = payment.point_of_interaction?.transaction_data || {};
  if (!td.qr_code) throw new PaymentError('Não foi possível gerar o Pix agora. Tente novamente.');
  await query(
    'insert into billing_charges (id, account_id, provider_id, amount, status, qr_code, qr_base64, ticket_url, expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, accountId, String(payment.id), acc.monthly_fee, 'pending', td.qr_code, td.qr_code_base64 || '', td.ticket_url || '', expires.toISOString()],
  );
  return { id, amount: Number(acc.monthly_fee), status: 'pending', qr_code: td.qr_code, qr_base64: td.qr_code_base64 || '', ticket_url: td.ticket_url || '', expires_at: expires.toISOString() };
}

/**
 * Consulta o pagamento no Mercado Pago (fonte da verdade) e, se aprovado, dá baixa:
 * registra no histórico, avança o vencimento e libera o acesso. Pode ser chamado várias vezes.
 */
export async function syncProviderPayment(providerId: string): Promise<string> {
  if (!/^[\w-]{1,64}$/.test(providerId)) throw new PaymentError('Pagamento inválido.');
  const payment = await mp<MpPayment>('/v1/payments/' + encodeURIComponent(providerId));
  const charge = (await query<{ id: string; account_id: string; status: string; provider_id: string }>(
    'select id, account_id, status, provider_id from billing_charges where id = $1', [payment.external_reference || ''],
  )).rows[0];
  if (!charge || charge.provider_id !== String(payment.id)) return 'ignored';
  if (charge.status === 'paid') return 'paid';
  if (payment.status !== 'approved') {
    if (['cancelled', 'rejected', 'refunded', 'charged_back', 'expired'].includes(payment.status)) {
      await query("update billing_charges set status = $2 where id = $1 and status = 'pending'", [charge.id, payment.status]);
    }
    return payment.status;
  }

  const client = await pool().connect();
  try {
    await client.query('begin');
    const upd = await client.query("update billing_charges set status = 'paid', paid_at = now() where id = $1 and status <> 'paid' returning id", [charge.id]);
    if (upd.rowCount) {
      const today = todaySP();
      const acc = (await client.query<{ next_due_date: string | null; billing_day: number | null; last_payment_date: string | null; status: string }>(
        'select next_due_date, billing_day, last_payment_date, status from accounts where id = $1 for update', [charge.account_id],
      )).rows[0];
      if (acc) {
        await client.query(
          "insert into account_payments (id, account_id, paid_at, amount, method, note, external_id) values ($1,$2,$3,$4,'Pix (Mercado Pago)','Pagamento automático',$5) on conflict do nothing",
          [randomUUID(), charge.account_id, today, payment.transaction_amount, 'mp:' + payment.id],
        );
        if (acc.status === 'pendente') {
          // Primeiro pagamento de quem se cadastrou pelo site: libera o acesso e define o dia de vencimento.
          const day = acc.billing_day || Math.min(Number(today.slice(8, 10)), 28);
          await client.query("update accounts set status = 'ativo', status_reason = '', billing_day = $2, start_date = coalesce(start_date, $3::date), next_due_date = $4, last_payment_date = $3::date where id = $1", [
            charge.account_id, day, today, addMonth(today, day),
          ]);
        } else {
          await client.query('update accounts set next_due_date = $2, last_payment_date = greatest(coalesce(last_payment_date, $3::date), $3::date) where id = $1', [
            charge.account_id, nextDueAfterPayment(acc.next_due_date, acc.billing_day, today), today,
          ]);
        }
      }
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return 'paid';
}

/** Situação de uma cobrança do próprio cliente; se ainda pendente, confere direto no Mercado Pago. */
export async function chargeStatus(chargeId: string, accountId: string): Promise<string> {
  const r = await query<{ status: string; provider_id: string; expires_at: string }>(
    'select status, provider_id, expires_at from billing_charges where id = $1 and account_id = $2', [chargeId, accountId],
  );
  const c = r.rows[0];
  if (!c) throw new PaymentError('Cobrança não encontrada.');
  if (c.status !== 'pending') return c.status;
  try {
    const s = await syncProviderPayment(c.provider_id);
    if (s === 'paid' || s !== 'pending') return s === 'ignored' ? 'pending' : s;
  } catch (e) {
    console.error('Falha ao conferir pagamento', e);
  }
  return new Date(c.expires_at) < new Date() ? 'expired' : 'pending';
}

/** Valida a assinatura do webhook do Mercado Pago (x-signature). */
export function validWebhookSignature(req: Request, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado: segurança vem da consulta ao Mercado Pago
  const header = req.headers.get('x-signature') || '';
  const requestId = req.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=').map((s) => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(parts.v1), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
