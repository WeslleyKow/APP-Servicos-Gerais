import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import ChangePassword from '../change-password';
import AdminPanel from './admin-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administração | Painel Geral' };

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');
  if (session.mustChangePassword) return <ChangePassword forced admin title="Administração" />;
  return <AdminPanel name={session.displayName || session.username} />;
}
