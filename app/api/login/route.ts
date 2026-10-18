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
    const token = await login(username, password);
    if (!token) return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    console.error('Falha no login', e);
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente novamente em instantes.' }, { status: 500 });
  }
}
