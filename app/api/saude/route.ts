import { databaseEnvName, ready } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Diagnóstico da conexão com o banco. Mostra apenas nomes de variáveis, nunca valores.
export async function GET() {
  const envs = Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|PG|NEON/i.test(k)).sort();
  const usando = databaseEnvName();
  let banco = 'ok';
  try {
    if (!usando) throw new Error('nenhuma variável de conexão encontrada');
    await ready();
  } catch (e) {
    banco = 'erro: ' + ((e as Error).message || String(e)).replace(/postgres(ql)?:\/\/[^\s]+/gi, '[url]');
  }
  return Response.json({ banco, variavelUsada: usando, variaveisEncontradas: envs }, { headers: { 'Cache-Control': 'no-store' } });
}
