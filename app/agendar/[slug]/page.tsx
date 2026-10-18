import type { Metadata } from 'next';
import { BookingError, publicPage } from '../../../lib/booking-server';
import { themeVars } from '../../../lib/theme';
import BookingFlow from './booking-flow';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

async function get(slug: string) {
  try {
    return { page: await publicPage(slug) };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    console.error('Falha ao abrir link de agendamento', e);
    return { error: 'Não foi possível abrir a agenda agora. Tente novamente em instantes.' };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await get(slug);
  return r.page
    ? { title: `Agendar · ${r.page.business}`, description: `Agende seu horário com ${r.page.business} em poucos passos.` }
    : { title: 'Agendamento online' };
}

export default async function AgendarPage({ params }: Props) {
  const { slug } = await params;
  const r = await get(slug);
  if (!r.page) {
    return (
      <div className="book-page">
        <div className="book-card book-message"><h1>Agenda indisponível</h1><p>{r.error}</p></div>
      </div>
    );
  }
  return (
    <div className="book-page" style={themeVars(r.page.theme)}>
      <BookingFlow page={r.page} />
    </div>
  );
}
