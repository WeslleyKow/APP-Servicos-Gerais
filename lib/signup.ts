import { query } from './db';
import { createAccount, InputError } from './admin';
import { mpConfigured, signPayToken } from './payments';

// Cadastro pelo site: o valor e as regras são definidos pelo administrador.

export type SignupConfig = { enabled: boolean; price: number; plan: string; autoBlockDays: number | null; headline: string };
export const DEFAULT_SIGNUP: SignupConfig = { enabled: false, price: 0, plan: 'Mensal', autoBlockDays: 5, headline: '' };

function normalize(raw: unknown): SignupConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SignupConfig>;
  const price = Math.round(Number(r.price) * 100) / 100;
  const block = r.autoBlockDays === null || (r.autoBlockDays as unknown) === '' ? null : Number(r.autoBlockDays);
  return {
    enabled: r.enabled === true,
    price: Number.isFinite(price) && price >= 0 && price <= 100000 ? price : 0,
    plan: typeof r.plan === 'string' && r.plan.trim() ? r.plan.trim().slice(0, 60) : DEFAULT_SIGNUP.plan,
    autoBlockDays: block === null ? null : Number.isInteger(block) && block >= 0 && block <= 365 ? block : DEFAULT_SIGNUP.autoBlockDays,
    headline: typeof r.headline === 'string' ? r.headline.trim().slice(0, 200) : '',
  };
}

export async function getSignupConfig(): Promise<SignupConfig> {
  const r = await query<{ value: string }>("select value from app_meta where key = 'signup_config'");
  try { return normalize(r.rows[0] ? JSON.parse(r.rows[0].value) : null); } catch { return { ...DEFAULT_SIGNUP }; }
}

export async function setSignupConfig(raw: unknown): Promise<SignupConfig> {
  const cfg = normalize(raw);
  if (cfg.enabled && cfg.price <= 0) throw new InputError('Defina o valor da mensalidade para abrir o cadastro pelo site.');
  await query("insert into app_meta (key, value) values ('signup_config', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(cfg)]);
  return cfg;
}

/** Dados públicos da página de cadastro (inclui quem indicou, se houver). */
export async function publicSignup(ref: string | null) {
  const cfg = await getSignupConfig();
  let referrer: string | null = null;
  if (ref && /^[a-z0-9-]{3,40}$/.test(ref)) {
    referrer = (await query<{ business_name: string }>("select business_name from accounts where booking_slug = $1 and status = 'ativo'", [ref])).rows[0]?.business_name ?? null;
  }
  return { enabled: cfg.enabled && cfg.price > 0, price: cfg.price, plan: cfg.plan, headline: cfg.headline, payOnline: mpConfigured(), referrer };
}

/** Cria a conta como "aguardando 1º pagamento" e devolve o token para pagar o Pix na hora. */
export async function selfSignup(b: Record<string, unknown>) {
  if (b.website) throw new InputError('Não foi possível concluir o cadastro.'); // campo isca contra robôs
  const cfg = await getSignupConfig();
  if (!cfg.enabled || cfg.price <= 0) throw new InputError('O cadastro pelo site está fechado no momento.');
  const phone = String(b.contact_phone || '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 13) throw new InputError('Informe seu WhatsApp com DDD.');
  if (!String(b.owner_name || '').trim()) throw new InputError('Informe seu nome.');
  const recent = await query<{ n: number }>("select count(*)::int as n from accounts where signup_source = 'site' and status = 'pendente' and created_at > now() - interval '1 hour'");
  if (recent.rows[0].n >= 30) throw new InputError('Muitos cadastros em pouco tempo. Tente novamente em alguns minutos.');
  let referredBy: string | null = null;
  if (typeof b.ref === 'string' && /^[a-z0-9-]{3,40}$/.test(b.ref)) {
    referredBy = (await query<{ id: string }>('select id from accounts where booking_slug = $1', [b.ref])).rows[0]?.id ?? null;
  }
  const id = await createAccount({
    business_name: b.business_name, segment: b.segment, owner_name: b.owner_name, contact_phone: phone, contact_email: b.contact_email,
    username: b.username, password: b.password, plan: cfg.plan, monthly_fee: cfg.price, auto_block_days: cfg.autoBlockDays, notes: 'Cadastro feito pelo site.',
  }, { status: 'pendente', source: 'site', referredBy, minPassword: 6 });
  return { id, payToken: mpConfigured() ? await signPayToken(id, 120) : null, price: cfg.price };
}
