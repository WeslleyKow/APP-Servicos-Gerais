import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { query } from './db';
import { verifyPassword } from './password';

export const SESSION_COOKIE = 'painel_sessao';
const SESSION_DAYS = 30;
// Hash válido de uma senha aleatória: usado para manter o tempo de resposta igual quando o usuário não existe.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export type Session = {
  userId: string;
  accountId: string;
  username: string;
  businessName: string;
  segment: string;
  ownerName: string;
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

export async function login(username: string, password: string): Promise<string | null> {
  const r = await query<{ id: string; password_hash: string }>('select id, password_hash from users where username = $1', [normalizeUsername(username)]);
  const user = r.rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  const token = randomBytes(32).toString('base64url');
  await query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)", [tokenHash(token), user.id, String(SESSION_DAYS)]);
  await query('delete from sessions where user_id = $1 and expires_at < now()', [user.id]);
  return token;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const r = await query<{ user_id: string; account_id: string; username: string; business_name: string; segment: string; owner_name: string }>(
    `select u.id as user_id, u.account_id, u.username, a.business_name, a.segment, a.owner_name
       from sessions s join users u on u.id = s.user_id join accounts a on a.id = u.account_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { userId: row.user_id, accountId: row.account_id, username: row.username, businessName: row.business_name, segment: row.segment, ownerName: row.owner_name };
}

/** Sessão do usuário atual (lida do cookie), memorizada por requisição. */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return sessionFromToken(store.get(SESSION_COOKIE)?.value);
});

export async function logout(token: string | undefined) {
  if (token) await query('delete from sessions where token_hash = $1', [tokenHash(token)]);
}

/** Bloqueia requisições de outros sites (proteção contra CSRF). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
