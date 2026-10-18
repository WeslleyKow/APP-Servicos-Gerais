import { changeOwnPassword, getSession, readSessionToken, sameOrigin } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
    const current = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.next === 'string' ? body.next : '';
    const error = await changeOwnPassword(session, current, next, readSessionToken(req));
    if (error) return Response.json({ error }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('Falha ao trocar senha', e);
    return Response.json({ error: 'Não foi possível trocar a senha agora.' }, { status: 500 });
  }
}
