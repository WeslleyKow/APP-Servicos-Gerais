import { databaseEnvName, ready } from '../../../lib/db';
import { lastMpError, mpConfigured } from '../../../lib/payments';

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
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const mercadoPago = {
    configurado: mpConfigured(),
    tipoDaChave: !token ? 'ausente' : token.startsWith('APP_USR-') ? 'producao' : token.startsWith('TEST-') ? 'teste' : 'desconhecido',
    segredoWebhook: !!process.env.MERCADOPAGO_WEBHOOK_SECRET,
    ultimoErro: banco === 'ok' ? await lastMpError().catch(() => null) : null,
  };
  return Response.json({ banco, variavelUsada: usando, variaveisEncontradas: envs, mercadoPago }, { headers: { 'Cache-Control': 'no-store' } });
}
