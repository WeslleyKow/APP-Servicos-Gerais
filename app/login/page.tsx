import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entrar | Painel Geral' };

export default async function LoginPage() {
  const session = await getSession().catch(() => null);
  if (session) redirect(session.role === 'admin' ? '/admin' : '/');
  return <LoginForm />;
}
