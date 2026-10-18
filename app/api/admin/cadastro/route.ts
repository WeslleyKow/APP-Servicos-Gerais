import { getAdminSession, sameOrigin } from '../../../../lib/auth';
import { InputError } from '../../../../lib/admin';
import { getSignupConfig, setSignupConfig } from '../../../../lib/signup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const denied = () => Response.json({ error: 'Acesso restrito ao administrador.' }, { status: 401 });

export async function GET() {
  if (!(await getAdminSession())) return denied();
  return Response.json({ config: await getSignupConfig() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    if (!(await getAdminSession())) return denied();
    return Response.json({ config: await setSignupConfig(await req.json().catch(() => null)) });
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
    console.error('Falha ao salvar configuração de cadastro', e);
    return Response.json({ error: 'Não foi possível salvar.' }, { status: 500 });
  }
}
