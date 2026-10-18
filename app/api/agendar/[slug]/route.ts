import { sameOrigin } from '../../../../lib/auth';
import { availability, BookingError, createBooking } from '../../../../lib/booking-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };
function fail(e: unknown) {
  if (e instanceof BookingError) return Response.json({ error: e.message }, { status: e.status });
  console.error('Falha no agendamento online', e);
  return Response.json({ error: 'Não foi possível concluir agora. Tente novamente.' }, { status: 500 });
}

/** Horários livres de um serviço em um dia (público). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const times = await availability(slug, url.searchParams.get('date') || '', url.searchParams.get('service') || '');
    return Response.json({ times }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

/** Cria o agendamento (público). */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const { slug } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Response.json({ booking: await createBooking(slug, body) });
  } catch (e) {
    return fail(e);
  }
}
