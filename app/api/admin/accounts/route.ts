import { getAdminSession, sameOrigin } from '../../../../lib/auth';
import { createAccount, InputError, listAccounts } from '../../../../lib/admin';
import { mpConfigured } from '../../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const denied = () => Response.json({ error: 'Acesso restrito ao administrador.' }, { status: 401 });
function fail(e: unknown) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
  console.error('Erro no painel do administrador', e);
  return Response.json({ error: 'Não foi possível concluir agora. Tente novamente.' }, { status: 500 });
}

export async function GET() {
  try {
    if (!(await getAdminSession())) return denied();
    return Response.json({ accounts: await listAccounts(), mercadopago: mpConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    if (!(await getAdminSession())) return denied();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const id = await createAccount(body);
    return Response.json({ id });
  } catch (e) {
    return fail(e);
  }
}
