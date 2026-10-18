import { getSession, sameOrigin } from '../../../lib/auth';
import { ackBookings, BookingError, getSlug, newBookings, setSlug } from '../../../lib/booking-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const denied = () => Response.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });
function fail(e: unknown) {
  if (e instanceof BookingError) return Response.json({ error: e.message }, { status: e.status });
  console.error('Falha nos agendamentos online', e);
  return Response.json({ error: 'Não foi possível concluir agora.' }, { status: 500 });
}
async function account() {
  const s = await getSession();
  return s && s.role === 'client' && !s.mustChangePassword ? s.accountId : null;
}

/** Endereço do link e agendamentos novos que ainda não entraram na agenda. */
export async function GET() {
  try {
    const id = await account();
    if (!id) return denied();
    return Response.json({ slug: await getSlug(id), bookings: await newBookings(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

/** Confirma que o painel importou os agendamentos. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const id = await account();
    if (!id) return denied();
    const body = (await req.json().catch(() => ({}))) as { ack?: unknown };
    await ackBookings(id, body.ack);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** Troca o endereço do link. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    const id = await account();
    if (!id) return denied();
    const body = (await req.json().catch(() => ({}))) as { slug?: unknown };
    return Response.json({ slug: await setSlug(id, body.slug) });
  } catch (e) {
    return fail(e);
  }
}
