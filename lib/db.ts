import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from './password';

type Globals = { __painelPool?: Pool; __painelReady?: Promise<void> };
const g = globalThis as typeof globalThis & Globals;

function connectionString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Banco de dados não configurado (DATABASE_URL ausente).');
  return url;
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
`;

/** Contas de teste criadas automaticamente na primeira execução. */
const TEST_ACCOUNTS = [
  { id: 'nathaly', business: 'Nathaly Manicure', segment: 'Manicure & cuidado', owner: 'Nathaly', username: 'nathaly', password: 'nathaly' },
];

async function migrate() {
  const client = await pool().connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(724001)');
    await client.query(SCHEMA);
    for (const a of TEST_ACCOUNTS) {
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

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) {
  await ready();
  return pool().query<T>(text, params);
}
