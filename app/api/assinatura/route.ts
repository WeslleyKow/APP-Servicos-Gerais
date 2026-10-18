import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { mpConfigured } from '../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dados da mensalidade do cliente logado (para o aviso de vencimento no painel). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'client') return Response.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });
    const r = await query<{ monthly_fee: number | null; next_due_date: string | null; status: string; auto_block_days: number | null }>(
      'select monthly_fee, next_due_date, status, auto_block_days from accounts where id = $1', [session.accountId],
    );
    const a = r.rows[0];
    return Response.json({
      fee: a?.monthly_fee ?? null, nextDue: a?.next_due_date ?? null, status: a?.status, autoBlockDays: a?.auto_block_days ?? null,
      payOnline: mpConfigured() && !!a?.monthly_fee,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Falha ao ler assinatura', e);
    return Response.json({ error: 'Não foi possível carregar a assinatura.' }, { status: 500 });
  }
}
