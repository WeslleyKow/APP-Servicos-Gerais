import { getSession, sameOrigin } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LISTS = ['clients', 'services', 'packages', 'sales', 'appointments', 'entries', 'blocks'];
const unauthorized = () => Response.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const r = await query<{ data: Record<string, unknown>; version: number }>('select data, version from workspaces where account_id = $1', [session.accountId]);
    const row = r.rows[0];
    const data = row && Object.keys(row.data).length ? row.data : null;
    return Response.json({ data, version: row?.version ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Falha ao carregar dados', e);
    return Response.json({ error: 'Não foi possível carregar os dados agora.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body: { data?: Record<string, unknown>; version?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }
    const { data, version } = body;
    const json = data ? JSON.stringify(data) : '';
    if (!Number.isInteger(version) || version! < 0 || !data || typeof data !== 'object' || LISTS.some((k) => !Array.isArray(data[k])) || json.length > 1_500_000) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }
    await query("insert into workspaces (account_id, data, version) values ($1, '{}'::jsonb, 0) on conflict (account_id) do nothing", [session.accountId]);
    const r = await query<{ version: number }>('update workspaces set data = $2::jsonb, version = version + 1 where account_id = $1 and version = $3 returning version', [session.accountId, json, version]);
    if (!r.rowCount) return Response.json({ error: 'Os dados mudaram em outra janela. Atualize a página antes de continuar.' }, { status: 409 });
    return Response.json({ version: r.rows[0].version });
  } catch (e) {
    console.error('Falha ao salvar dados', e);
    return Response.json({ error: 'Não foi possível salvar.' }, { status: 500 });
  }
}
