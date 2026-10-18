import { NextResponse } from 'next/server';
import { login, sameOrigin, SESSION_COOKIE, sessionCookieOptions } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 });
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username.trim() || !password) return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });
  try {
    const result = await login(username, password);
    if ('error' in result) return NextResponse.json({ error: result.error, payToken: result.payToken }, { status: result.status });
    const res = NextResponse.json({ ok: true, redirect: result.role === 'admin' ? '/admin' : '/' });
    res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions);
    return res;
  } catch (e) {
    console.error('Falha no login', e);
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente novamente em instantes.' }, { status: 500 });
  }
}
