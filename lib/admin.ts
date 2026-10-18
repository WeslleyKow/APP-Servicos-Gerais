import { randomUUID } from 'node:crypto';
import { pool, query } from './db';
import { hashPassword } from './password';
import { normalizeUsername } from './auth';
import { addMonth, firstDue, isDate, STATUSES, todaySP } from './billing';

export type AccountRow = {
  id: string; business_name: string; segment: string; owner_name: string; created_at: string;
  status: string; status_reason: string; plan: string; monthly_fee: number | null; billing_day: number | null;
  start_date: string | null; next_due_date: string | null; last_payment_date: string | null; auto_block_days: number | null;
  contact_phone: string; contact_email: string; notes: string;
  username: string | null; last_login_at: string | null; total_paid: number; signup_source: string; referred_by_name: string | null;
};

export class InputError extends Error {}

const USERNAME = /^[a-z0-9._-]{3,40}$/;
const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function intOrNull(v: unknown, min: number, max: number, label: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new InputError(`${label} deve ser um número entre ${min} e ${max}.`);
  return n;
}
function moneyOrNull(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new InputError(`${label} inválido.`);
  return n;
}
function dateOrNull(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (!isDate(v)) throw new InputError(`${label} inválida.`);
  return v;
}

export async function listAccounts(): Promise<AccountRow[]> {
  const r = await query<AccountRow>(
    `select a.id, a.business_name, a.segment, a.owner_name, a.created_at, a.status, a.status_reason, a.plan, a.monthly_fee,
            a.billing_day, a.start_date, a.next_due_date, a.last_payment_date, a.auto_block_days,
            a.contact_phone, a.contact_email, a.notes,
            u.username, u.last_login_at, a.signup_source, (select r.business_name from accounts r where r.id = a.referred_by) as referred_by_name,
            coalesce((select sum(p.amount) from account_payments p where p.account_id = a.id), 0) as total_paid
       from accounts a
       left join lateral (select username, last_login_at from users where account_id = a.id and role = 'client' order by created_at limit 1) u on true
      order by lower(a.business_name)`,
  );
  return r.rows;
}

type ProfileInput = {
  business_name: string; segment: string; owner_name: string; plan: string; monthly_fee: number | null; billing_day: number | null;
  start_date: string | null; next_due_date: string | null; auto_block_days: number | null; contact_phone: string; contact_email: string; notes: string;
};

function parseProfile(b: Record<string, unknown>): ProfileInput {
  const business_name = text(b.business_name, 120);
  if (!business_name) throw new InputError('Informe o nome do negócio.');
  return {
    business_name,
    segment: text(b.segment, 120),
    owner_name: text(b.owner_name, 120),
    plan: text(b.plan, 80),
    monthly_fee: moneyOrNull(b.monthly_fee, 'Valor da mensalidade'),
    billing_day: intOrNull(b.billing_day, 1, 31, 'Dia de vencimento'),
    start_date: dateOrNull(b.start_date, 'Data de início'),
    next_due_date: dateOrNull(b.next_due_date, 'Próximo vencimento'),
    auto_block_days: intOrNull(b.auto_block_days, 0, 365, 'Dias para bloqueio automático'),
    contact_phone: text(b.contact_phone, 40),
    contact_email: text(b.contact_email, 120),
    notes: text(b.notes, 2000),
  };
}

export type CreateOptions = { status?: 'ativo' | 'pendente'; source?: string; referredBy?: string | null; minPassword?: number };

export async function createAccount(b: Record<string, unknown>, opts: CreateOptions = {}): Promise<string> {
  const p = parseProfile(b);
  const username = normalizeUsername(text(b.username, 40));
  if (!USERNAME.test(username)) throw new InputError('O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  const password = typeof b.password === 'string' ? b.password : '';
  if (!password) throw new InputError('Informe a senha inicial do cliente.');
  if (opts.minPassword && password.length < opts.minPassword) throw new InputError(`A senha precisa ter pelo menos ${opts.minPassword} caracteres.`);
  const status = opts.status || 'ativo';
  if (!p.start_date) p.start_date = todaySP();
  if (status === 'ativo' && !p.next_due_date && p.monthly_fee) p.next_due_date = firstDue(p.start_date, p.billing_day);
  const id = randomUUID();
  const client = await pool().connect();
  try {
    await client.query('begin');
    const taken = await client.query('select 1 from users where username = $1', [username]);
    if (taken.rowCount) throw new InputError('Esse usuário já está em uso. Escolha outro.');
    await client.query(
      `insert into accounts (id, business_name, segment, owner_name, plan, monthly_fee, billing_day, start_date, next_due_date, auto_block_days, contact_phone, contact_email, notes, status, booking_slug, signup_source, referred_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$15,
               case when exists (select 1 from accounts where booking_slug = $14) then null else $14 end, $16, $17)`,
      [id, p.business_name, p.segment, p.owner_name, p.plan, p.monthly_fee, p.billing_day, p.start_date, p.next_due_date, p.auto_block_days, p.contact_phone, p.contact_email, p.notes, username.replace(/[^a-z0-9-]/g, '-'), status, opts.source || 'admin', opts.referredBy || null],
    );
    await client.query(
      'insert into users (id, account_id, username, password_hash, display_name, role, must_change_password) values ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), id, username, await hashPassword(password), p.owner_name || p.business_name, 'client', b.must_change_password === true],
    );
    await client.query('commit');
    return id;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function ensureAccount(id: string) {
  const r = await query('select 1 from accounts where id = $1', [id]);
  if (!r.rowCount) throw new InputError('Cliente não encontrado.');
}

export async function updateAccount(id: string, b: Record<string, unknown>) {
  await ensureAccount(id);
  const p = parseProfile(b);
  await query(
    `update accounts set business_name=$2, segment=$3, owner_name=$4, plan=$5, monthly_fee=$6, billing_day=$7, start_date=$8,
            next_due_date=$9, auto_block_days=$10, contact_phone=$11, contact_email=$12, notes=$13 where id=$1`,
    [id, p.business_name, p.segment, p.owner_name, p.plan, p.monthly_fee, p.billing_day, p.start_date, p.next_due_date, p.auto_block_days, p.contact_phone, p.contact_email, p.notes],
  );
  // O nome do negócio também aparece dentro do painel do cliente.
  await query(
    `update workspaces set data = jsonb_set(data, '{settings}', coalesce(data->'settings', '{}'::jsonb) || jsonb_build_object('business', $2::text)), version = version + 1
      where account_id = $1 and data ? 'settings'`,
    [id, p.business_name],
  );
  const username = b.username === undefined ? null : normalizeUsername(text(b.username, 40));
  if (username) {
    if (!USERNAME.test(username)) throw new InputError('Usuário inválido.');
    const taken = await query("select 1 from users where username = $1 and (account_id is distinct from $2)", [username, id]);
    if (taken.rowCount) throw new InputError('Esse usuário já está em uso. Escolha outro.');
    await query("update users set username = $2 where account_id = $1 and role = 'client'", [id, username]);
  }
}

export async function setStatus(id: string, status: unknown, reason: unknown) {
  await ensureAccount(id);
  if (typeof status !== 'string' || !STATUSES.includes(status as never)) throw new InputError('Situação inválida.');
  await query('update accounts set status = $2, status_reason = $3 where id = $1', [id, status, status === 'ativo' ? '' : text(reason, 300)]);
  // Ao suspender ou bloquear, encerra as sessões abertas do cliente.
  if (status !== 'ativo') await query('delete from sessions where user_id in (select id from users where account_id = $1)', [id]);
}

export async function resetPassword(id: string, password: unknown, mustChange: unknown) {
  await ensureAccount(id);
  if (typeof password !== 'string' || !password) throw new InputError('Informe a nova senha.');
  await query("update users set password_hash = $2, must_change_password = $3, failed_attempts = 0, locked_until = null where account_id = $1 and role = 'client'", [id, await hashPassword(password), mustChange === true]);
  await query('delete from sessions where user_id in (select id from users where account_id = $1)', [id]);
}

export async function deleteAccount(id: string) {
  await ensureAccount(id);
  await query('delete from users where account_id = $1', [id]);
  await query('delete from accounts where id = $1', [id]);
}

export type PaymentRow = { id: string; paid_at: string; amount: number; method: string; note: string; created_at: string };

export async function listPayments(id: string): Promise<PaymentRow[]> {
  const r = await query<PaymentRow>('select id, paid_at, amount, method, note, created_at from account_payments where account_id = $1 order by paid_at desc, created_at desc', [id]);
  return r.rows;
}

/** Registra um pagamento; com `advance`, o próximo vencimento avança um mês. */
export async function addPayment(id: string, b: Record<string, unknown>) {
  await ensureAccount(id);
  const paid_at = dateOrNull(b.paid_at, 'Data do pagamento') || todaySP();
  const amount = moneyOrNull(b.amount, 'Valor');
  if (!amount) throw new InputError('Informe o valor recebido.');
  await query('insert into account_payments (id, account_id, paid_at, amount, method, note) values ($1,$2,$3,$4,$5,$6)', [randomUUID(), id, paid_at, amount, text(b.method, 40), text(b.note, 300)]);
  const acc = (await query<{ next_due_date: string | null; billing_day: number | null; last_payment_date: string | null }>('select next_due_date, billing_day, last_payment_date from accounts where id = $1', [id])).rows[0];
  const last = !acc.last_payment_date || paid_at > acc.last_payment_date ? paid_at : acc.last_payment_date;
  const next = b.advance === false ? acc.next_due_date : addMonth(acc.next_due_date || paid_at, acc.billing_day);
  await query('update accounts set last_payment_date = $2, next_due_date = $3 where id = $1', [id, last, next]);
}

export async function deletePayment(id: string, paymentId: unknown) {
  if (typeof paymentId !== 'string') throw new InputError('Pagamento inválido.');
  const r = await query('delete from account_payments where id = $1 and account_id = $2', [paymentId, id]);
  if (!r.rowCount) throw new InputError('Pagamento não encontrado.');
  await query('update accounts set last_payment_date = (select max(paid_at) from account_payments where account_id = $1) where id = $1', [id]);
}
