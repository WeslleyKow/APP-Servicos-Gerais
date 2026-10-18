import { NextResponse } from 'next/server';
import { logout, readSessionToken, sameOrigin, SESSION_COOKIE, sessionCookieOptions } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    await logout(readSessionToken(req));
  } catch (e) {
    console.error('Falha ao encerrar sessão', e);
  }
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
