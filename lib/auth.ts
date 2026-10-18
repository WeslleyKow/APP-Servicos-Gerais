import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { query } from './db';
import { hashPassword, verifyPassword } from './password';
import { accessAllowed } from './billing';
import { mpConfigured, signPayToken } from './payments';

export const SESSION_COOKIE = 'painel_sessao';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Hash válido de uma senha aleatória: usado para manter o tempo de resposta igual quando o usuário não existe.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export type Role = 'client' | 'admin';
export type Session = {
  userId: string;
  role: Role;
  accountId: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  businessName: string;
  segment: string;
  ownerName: string;
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

const BLOCKED_MESSAGE: Record<string, string> = {
  suspenso: 'Seu acesso está suspenso. Entre em contato com o suporte.',
  bloqueado: 'Seu acesso está bloqueado. Entre em contato com o suporte.',
  atraso: 'Seu acesso foi bloqueado por atraso no pagamento. Entre em contato com o suporte.',
};

type LoginRow = {
  id: string; role: Role; password_hash: string; failed_attempts: number; locked: boolean;
  status: string | null; next_due_date: string | null; auto_block_days: number | null; account_id: string | null; monthly_fee: number | null;
};

export type LoginResult = { token: string; role: Role } | { error: string; status: number; payToken?: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const r = await query<LoginRow>(
    `select u.id, u.role, u.password_hash, u.failed_attempts, coalesce(u.locked_until > now(), false) as locked,
            a.status, a.next_due_date, a.auto_block_days, a.id as account_id, a.monthly_fee
       from users u left join accounts a on a.id = u.account_id
      where u.username = $1`,
    [normalizeUsername(username)],
  );
  const user = r.rows[0];
  if (user?.locked) return { error: `Muitas tentativas incorretas. Tente novamente em ${LOCK_MINUTES} minutos.`, status: 429 };
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      await query(
        `update users set failed_attempts = failed_attempts + 1,
                locked_until = case when failed_attempts + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
          where id = $1`,
        [user.id, MAX_ATTEMPTS, String(LOCK_MINUTES)],
      );
    }
    return { error: 'Usuário ou senha incorretos.', status: 401 };
  }
  if (user.role === 'client') {
    if (!user.status) return { error: 'Conta não encontrada.', status: 403 };
    if (!accessAllowed({ status: user.status, next_due_date: user.next_due_date, auto_block_days: user.auto_block_days })) {
      if (user.status === 'pendente') {
        if (user.account_id && mpConfigured() && user.monthly_fee) {
          return { error: 'Falta só o pagamento para liberar seu acesso. Pague com Pix e entre na hora.', status: 403, payToken: await signPayToken(user.account_id) };
        }
        return { error: 'Seu cadastro está aguardando liberação. Em breve entraremos em contato.', status: 403 };
      }
      if (user.status === 'ativo' && user.account_id && mpConfigured() && user.monthly_fee) {
        // Bloqueado só por atraso: pode pagar com Pix ali mesmo e entrar em seguida.
        return { error: 'Seu acesso está bloqueado por atraso no pagamento. Pague a mensalidade com Pix para liberar na hora.', status: 403, payToken: await signPayToken(user.account_id) };
      }
      return { error: BLOCKED_MESSAGE[user.status === 'ativo' ? 'atraso' : user.status] || BLOCKED_MESSAGE.bloqueado, status: 403 };
    }
  }
  const token = randomBytes(32).toString('base64url');
  await query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)", [tokenHash(token), user.id, String(SESSION_DAYS)]);
  await query('update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1', [user.id]);
  await query('delete from sessions where user_id = $1 and expires_at < now()', [user.id]);
  return { token, role: user.role };
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

type SessionRow = {
  user_id: string; role: Role; account_id: string | null; username: string; display_name: string; must_change_password: boolean;
  business_name: string | null; segment: string | null; owner_name: string | null;
  status: string | null; next_due_date: string | null; auto_block_days: number | null;
};

export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const r = await query<SessionRow>(
    `select u.id as user_id, u.role, u.account_id, u.username, u.display_name, u.must_change_password,
            a.business_name, a.segment, a.owner_name, a.status, a.next_due_date, a.auto_block_days
       from sessions s join users u on u.id = s.user_id left join accounts a on a.id = u.account_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.role === 'client') {
    // Cliente suspenso, bloqueado ou removido perde o acesso na hora.
    if (!row.account_id || !row.status || !accessAllowed({ status: row.status, next_due_date: row.next_due_date, auto_block_days: row.auto_block_days })) return null;
  }
  return {
    userId: row.user_id, role: row.role, accountId: row.account_id || '', username: row.username,
    displayName: row.display_name, mustChangePassword: row.must_change_password,
    businessName: row.business_name || '', segment: row.segment || '', ownerName: row.owner_name || '',
  };
}

/** Sessão do usuário atual (lida do cookie), memorizada por requisição. */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return sessionFromToken(store.get(SESSION_COOKIE)?.value);
});

/** Sessão de administrador já com a senha definitiva (ou null). */
export async function getAdminSession(): Promise<Session | null> {
  const s = await getSession();
  return s && s.role === 'admin' && !s.mustChangePassword ? s : null;
}

export async function logout(token: string | undefined) {
  if (token) await query('delete from sessions where token_hash = $1', [tokenHash(token)]);
}

/** Troca a senha do usuário atual e encerra as outras sessões dele. */
export async function changeOwnPassword(session: Session, current: string, next: string, keepToken: string | undefined): Promise<string | null> {
  const r = await query<{ password_hash: string }>('select password_hash from users where id = $1', [session.userId]);
  if (!r.rows[0] || !(await verifyPassword(current, r.rows[0].password_hash))) return 'A senha atual está incorreta.';
  if (!next) return 'Informe a nova senha.';
  if (session.role === 'admin' && next.length < 8) return 'A senha do administrador precisa ter pelo menos 8 caracteres.';
  if (next === current) return 'A nova senha precisa ser diferente da atual.';
  await query('update users set password_hash = $2, must_change_password = false where id = $1', [session.userId, await hashPassword(next)]);
  await query('delete from sessions where user_id = $1 and token_hash <> $2', [session.userId, keepToken ? tokenHash(keepToken) : '']);
  return null;
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

export function readSessionToken(req: Request): string | undefined {
  const raw = req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  return raw ? decodeURIComponent(raw) : undefined;
}
