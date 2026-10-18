import { getSession, sameOrigin } from '../../../../lib/auth';
import { chargeStatus, getOrCreateCharge, PaymentError, verifyPayToken } from '../../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// O cliente paga logado (sessão) ou pela tela de login quando está bloqueado por atraso (payToken).
async function accountFrom(payToken: unknown): Promise<string | null> {
  const fromToken = await verifyPayToken(payToken);
  if (fromToken) return fromToken;
  const s = await getSession();
  return s && s.role === 'client' ? s.accountId : null;
}
function fail(e: unknown) {
  if (e instanceof PaymentError) return Response.json({ error: e.message }, { status: 400 });
  console.error('Falha no pagamento Pix', e);
  return Response.json({ error: 'Não foi possível concluir agora. Tente novamente.' }, { status: 500 });
}
const denied = () => Response.json({ error: 'Sessão expirada. Entre novamente para pagar.' }, { status: 401 });

/** Gera (ou reaproveita) o Pix da mensalidade. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const body = (await req.json().catch(() => ({}))) as { payToken?: unknown };
    const accountId = await accountFrom(body.payToken);
    if (!accountId) return denied();
    const origin = req.headers.get('x-forwarded-host') ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` : new URL(req.url).origin;
    return Response.json({ charge: await getOrCreateCharge(accountId, origin) });
  } catch (e) {
    return fail(e);
  }
}

/** Situação do Pix (o painel consulta a cada poucos segundos enquanto o QR Code está aberto). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const accountId = await accountFrom(url.searchParams.get('payToken'));
    if (!accountId) return denied();
    const id = url.searchParams.get('id') || '';
    return Response.json({ status: await chargeStatus(id, accountId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}
