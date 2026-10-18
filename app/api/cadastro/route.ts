import { sameOrigin } from '../../../lib/auth';
import { InputError } from '../../../lib/admin';
import { publicSignup, selfSignup } from '../../../lib/signup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(e: unknown) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
  console.error('Falha no cadastro pelo site', e);
  return Response.json({ error: 'Não foi possível concluir o cadastro agora. Tente novamente.' }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    return Response.json(await publicSignup(new URL(req.url).searchParams.get('ref')), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    return Response.json(await selfSignup(body));
  } catch (e) {
    return fail(e);
  }
}
