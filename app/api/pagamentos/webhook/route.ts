import { mpConfigured, syncProviderPayment, validWebhookSignature } from '../../../../lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aviso do Mercado Pago: confere o pagamento direto na API e dá baixa se aprovado. */
export async function POST(req: Request) {
  if (!mpConfigured()) return Response.json({ ok: true });
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string | number } };
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic;
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || (body.data?.id != null ? String(body.data.id) : '');
  if (type !== 'payment' || !dataId) return Response.json({ ok: true });
  if (!validWebhookSignature(req, dataId)) return Response.json({ error: 'Assinatura inválida' }, { status: 401 });
  try {
    const status = await syncProviderPayment(dataId);
    return Response.json({ ok: true, status });
  } catch (e) {
    console.error('Falha ao processar webhook do Mercado Pago', e);
    return Response.json({ error: 'Falha temporária' }, { status: 500 });
  }
}
