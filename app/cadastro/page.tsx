import type { Metadata } from 'next';
import { publicSignup } from '../../lib/signup';
import SignupForm from './signup-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Criar conta | Painel Geral', description: 'Agenda, clientes, vendas e financeiro do seu negócio em um só lugar. Crie sua conta em minutos.' };

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ indicacao?: string }> }) {
  const { indicacao } = await searchParams;
  const ref = typeof indicacao === 'string' ? indicacao.toLowerCase() : null;
  const info = await publicSignup(ref).catch(() => null);
  return <SignupForm info={info} refCode={info?.referrer ? ref : null} />;
}
