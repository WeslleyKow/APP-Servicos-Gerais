import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, types } from 'pg';
import { hashPassword } from './password';

// Datas (date) como texto AAAA-MM-DD e valores (numeric) como número.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => Number(v));

type Globals = { __painelPool?: Pool; __painelReady?: Promise<void> };
const g = globalThis as typeof globalThis & Globals;

const ENV_CANDIDATES = ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL'];

/** Nome da variável de ambiente usada para conectar (a integração Neon pode usar um prefixo). */
export function databaseEnvName(): string | null {
  for (const k of ENV_CANDIDATES) if (process.env[k]) return k;
  const prefixed = Object.keys(process.env).find((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && process.env[k]);
  return prefixed ?? null;
}

function connectionString() {
  const name = databaseEnvName();
  if (!name) throw new Error('Banco de dados não configurado (DATABASE_URL ausente).');
  return process.env[name]!;
}

export function pool(): Pool {
  if (!g.__painelPool) {
    g.__painelPool = new Pool({ connectionString: connectionString(), max: 3, idleTimeoutMillis: 10_000 });
  }
  return g.__painelPool;
}

const SCHEMA = `
create table if not exists accounts (
  id text primary key,
  business_name text not null,
  segment text not null default '',
  owner_name text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists users (
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);
create table if not exists workspaces (
  account_id text primary key references accounts(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 0
);
alter table users alter column account_id drop not null;
alter table users add column if not exists role text not null default 'client';
alter table users add column if not exists must_change_password boolean not null default false;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists failed_attempts integer not null default 0;
alter table users add column if not exists locked_until timestamptz;
alter table accounts add column if not exists status text not null default 'ativo';
alter table accounts add column if not exists status_reason text not null default '';
alter table accounts add column if not exists plan text not null default '';
alter table accounts add column if not exists monthly_fee numeric(10,2);
alter table accounts add column if not exists billing_day integer;
alter table accounts add column if not exists start_date date;
alter table accounts add column if not exists next_due_date date;
alter table accounts add column if not exists last_payment_date date;
alter table accounts add column if not exists auto_block_days integer;
alter table accounts add column if not exists contact_phone text not null default '';
alter table accounts add column if not exists contact_email text not null default '';
alter table accounts add column if not exists notes text not null default '';
create table if not exists account_payments (
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  paid_at date not null,
  amount numeric(10,2) not null,
  method text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists account_payments_account_idx on account_payments(account_id, paid_at desc);
create table if not exists app_meta (key text primary key, value text not null default '');
alter table account_payments add column if not exists external_id text;
create unique index if not exists account_payments_external_idx on account_payments(external_id) where external_id is not null;
create table if not exists billing_charges (
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  provider_id text unique,
  amount numeric(10,2) not null,
  status text not null default 'pending',
  qr_code text not null default '',
  qr_base64 text not null default '',
  ticket_url text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists billing_charges_account_idx on billing_charges(account_id, created_at desc);
alter table accounts add column if not exists booking_slug text;
create unique index if not exists accounts_booking_slug_idx on accounts(booking_slug);
create table if not exists bookings (
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  service_id text not null,
  service_name text not null,
  price numeric(10,2) not null default 0,
  duration integer not null,
  date date not null,
  time text not null,
  name text not null,
  phone text not null,
  status text not null default 'novo',
  created_at timestamptz not null default now()
);
create index if not exists bookings_account_idx on bookings(account_id, status, date);
alter table accounts add column if not exists signup_source text not null default 'admin';
alter table accounts add column if not exists referred_by text;
`;

/** Contas de teste criadas automaticamente na primeira execução. */
const TEST_ACCOUNTS = [
  { id: 'nathaly', business: 'Nathaly Manicure', segment: 'Manicure & cuidado', owner: 'Nathaly', username: 'nathaly', password: 'nathaly' },
];

async function migrate() {
  const client = await pool().connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(724002)');
    await client.query(SCHEMA);
    await client.query("insert into app_meta (key, value) values ('app_secret', $1) on conflict (key) do nothing", [randomBytes(32).toString('hex')]);
    // Conta de teste: criada uma única vez (se for removida pelo administrador, não volta).
    const seeded = await client.query("insert into app_meta (key, value) values ('seed_test_accounts', '1') on conflict (key) do nothing returning key");
    for (const a of seeded.rowCount ? TEST_ACCOUNTS : []) {
      await client.query(
        'insert into accounts (id, business_name, segment, owner_name) values ($1,$2,$3,$4) on conflict (id) do nothing',
        [a.id, a.business, a.segment, a.owner],
      );
      const exists = await client.query('select 1 from users where username = $1', [a.username]);
      if (!exists.rowCount) {
        await client.query(
          'insert into users (id, account_id, username, password_hash, display_name) values ($1,$2,$3,$4,$5)',
          [randomUUID(), a.id, a.username, await hashPassword(a.password), a.owner],
        );
      }
    }
    // Endereço padrão do link de agendamento = usuário de login (quando livre).
    await client.query(`update accounts a set booking_slug = u.username
                          from users u
                         where u.account_id = a.id and u.role = 'client' and a.booking_slug is null
                           and u.username ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                           and not exists (select 1 from accounts b where b.booking_slug = u.username)`);
    // Administrador inicial: admin / admin, com troca de senha obrigatória no primeiro acesso.
    const admin = await client.query("select 1 from users where role = 'admin' limit 1");
    if (!admin.rowCount) {
      const taken = await client.query("select 1 from users where username = 'admin'");
      await client.query(
        "insert into users (id, account_id, username, password_hash, display_name, role, must_change_password) values ($1, null, $2, $3, 'Administrador', 'admin', true)",
        [randomUUID(), taken.rowCount ? 'admin-' + randomUUID().slice(0, 4) : 'admin', await hashPassword('admin')],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Garante que as tabelas existam antes de qualquer consulta. */
export function ready(): Promise<void> {
  if (!g.__painelReady) {
    g.__painelReady = migrate().catch((e) => {
      g.__painelReady = undefined;
      throw e;
    });
  }
  return g.__painelReady;
}

let appSecret: string | undefined;
/** Segredo interno do sistema (gerado uma vez e guardado no banco). */
export async function getAppSecret(): Promise<string> {
  if (!appSecret) {
    await ready();
    const r = await pool().query<{ value: string }>("select value from app_meta where key = 'app_secret'");
    appSecret = r.rows[0].value;
  }
  return appSecret;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) {
  await ready();
  return pool().query<T>(text, params);
}
