import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Painel from './painel';
import { getSession } from '../lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession().catch(() => null);
  return { title: session ? `${session.businessName} | Painel Geral` : 'Painel Geral' };
}

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <Painel profile={{ business: session.businessName, segment: session.segment, owner: session.ownerName }} />;
}
