import { getAdminSession, sameOrigin } from '../../../../../lib/auth';
import { addPayment, deleteAccount, deletePayment, InputError, listPayments, resetPassword, setStatus, updateAccount } from '../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const denied = () => Response.json({ error: 'Acesso restrito ao administrador.' }, { status: 401 });
function fail(e: unknown) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
  console.error('Erro no painel do administrador', e);
  return Response.json({ error: 'Não foi possível concluir agora. Tente novamente.' }, { status: 500 });
}

/** Histórico de pagamentos do cliente. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    if (!(await getAdminSession())) return denied();
    const { id } = await params;
    return Response.json({ payments: await listPayments(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

/** Ações: atualizar dados, mudar situação, redefinir senha, registrar ou excluir pagamento. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    if (!(await getAdminSession())) return denied();
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    switch (body.action) {
      case 'update': await updateAccount(id, body); break;
      case 'status': await setStatus(id, body.status, body.reason); break;
      case 'password': await resetPassword(id, body.password, body.must_change_password); break;
      case 'payment': await addPayment(id, body); break;
      case 'delete-payment': await deletePayment(id, body.payment_id); break;
      default: return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  try {
    if (!(await getAdminSession())) return denied();
    const { id } = await params;
    await deleteAccount(id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
