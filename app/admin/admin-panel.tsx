'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Receipt, KeyRound, Plus, Search, X, Check, ShieldCheck, ShieldOff, Ban, Trash2, MessageCircle,
  ChevronRight, LogOut, AlertTriangle, CalendarClock, Wallet, UserCheck, LayoutDashboard, Globe, Copy, Hourglass,
} from 'lucide-react';
import { requestJSON } from '../../lib/request';
import { themeVars } from '../../lib/theme';
import { billingState, todaySP } from '../../lib/billing';
import ChangePassword from '../change-password';

type Account = {
  id: string; business_name: string; segment: string; owner_name: string; created_at: string;
  status: string; status_reason: string; plan: string; monthly_fee: number | null; billing_day: number | null;
  start_date: string | null; next_due_date: string | null; last_payment_date: string | null; auto_block_days: number | null;
  contact_phone: string; contact_email: string; notes: string; username: string | null; last_login_at: string | null; total_paid: number;
  signup_source?: string; referred_by_name?: string | null;
};
type Payment = { id: string; paid_at: string; amount: number; method: string; note: string };

const money = (v: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const dateTimeBR = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : 'Nunca');
const json = { 'Content-Type': 'application/json' };
const STATUS_LABEL: Record<string, string> = { ativo: 'Ativo', suspenso: 'Suspenso', bloqueado: 'Bloqueado' };
const FILTERS = ['Todos', 'Ativos', 'Atrasados', 'Vencendo', 'Aguardando pagamento', 'Suspensos/Bloqueados'] as const;

function stateOf(a: Account) {
  return billingState({ status: a.status, next_due_date: a.next_due_date, auto_block_days: a.auto_block_days });
}
function badgeClass(a: Account) {
  const s = stateOf(a);
  if (a.status === 'pendente') return 'badge warn';
  return 'badge ' + ({ inativo: 'danger', atrasado: 'danger', vencendo: 'warn', emdia: 'green', sem: 'muted' } as Record<string, string>)[s.key];
}
function whatsappLink(a: Account) {
  let p = a.contact_phone.replace(/\D/g, '');
  if (!p) return '';
  if (p.length === 10 || p.length === 11) p = '55' + p;
  const s = stateOf(a);
  const msg = `Olá, ${a.owner_name || a.business_name}! Passando para lembrar da mensalidade do Painel Geral` +
    (a.monthly_fee ? ` no valor de ${money(a.monthly_fee)}` : '') +
    (a.next_due_date ? `, com vencimento em ${dateBR(a.next_due_date)}` : '') + (s.key === 'atrasado' ? ' (em atraso)' : '') + '. Qualquer dúvida, estou à disposição!';
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(msg);
}

export default function AdminPanel({ name }: { name: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'Clientes' | 'Cobranças' | 'Cadastro pelo site' | 'Minha conta'>('Clientes');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todos');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mp, setMp] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await requestJSON<{ accounts: Account[]; mercadopago: boolean }>('/api/admin/accounts');
      setAccounts(r.accounts);
      setMp(r.mercadopago);
      setError('');
    } catch (e) {
      if ((e as { status?: number }).status === 401) { window.location.href = '/login'; return; }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const today = todaySP();
  const active = accounts.filter((a) => a.status === 'ativo');
  const overdue = active.filter((a) => stateOf(a).key === 'atrasado');
  const dueSoon = active.filter((a) => stateOf(a).key === 'vencendo');
  const inactive = accounts.filter((a) => a.status === 'suspenso' || a.status === 'bloqueado');
  const pendingSignups = accounts.filter((a) => a.status === 'pendente');
  const monthly = active.reduce((s, a) => s + (Number(a.monthly_fee) || 0), 0);
  const overdueTotal = overdue.reduce((s, a) => s + (Number(a.monthly_fee) || 0), 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      const k = stateOf(a).key;
      if (filter === 'Ativos' && a.status !== 'ativo') return false;
      if (filter === 'Atrasados' && k !== 'atrasado') return false;
      if (filter === 'Vencendo' && k !== 'vencendo') return false;
      if (filter === 'Suspensos/Bloqueados' && a.status !== 'suspenso' && a.status !== 'bloqueado') return false;
      if (filter === 'Aguardando pagamento' && a.status !== 'pendente') return false;
      return !q || [a.business_name, a.owner_name, a.username, a.segment, a.contact_phone, a.contact_email].join(' ').toLowerCase().includes(q);
    });
  }, [accounts, filter, query]);

  const charges = [...overdue, ...dueSoon].sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)));
  const opened = accounts.find((a) => a.id === openId) || null;

  const nav: [typeof view, typeof Users][] = [['Clientes', Users], ['Cobranças', Receipt], ['Cadastro pelo site', Globe], ['Minha conta', KeyRound]];

  return (
    <div className="shell admin" style={themeVars({ palette: 'grafite', font: 'sans' })}>
      <aside className="sidebar">
        <a className="brand" href="/admin"><span className="brand-symbol"><LayoutDashboard size={28} /></span><div>Painel Geral<small>ADMINISTRAÇÃO</small></div></a>
        <div className="nav-label">GESTÃO</div>
        <nav>
          {nav.map(([n, Icon]) => (
            <button key={n} className={view === n ? 'selected' : ''} onClick={() => setView(n)}>
              <Icon size={19} />{n}{n === 'Cobranças' && overdue.length > 0 && <span className="nav-count">{overdue.length}</span>}{n === 'Cadastro pelo site' && pendingSignups.length > 0 && <span className="nav-count warn">{pendingSignups.length}</span>}
            </button>
          ))}
        </nav>
        <div className="profile"><span>{(name[0] || 'A').toUpperCase()}</span><div>{name}<small>Administrador</small></div>
          <form method="post" action="/api/logout"><button className="icon" title="Sair" aria-label="Sair"><LogOut size={17} /></button></form>
        </div>
      </aside>
      <main>
        <header><span>ADMINISTRAÇÃO <ChevronRight size={12} /> {view}</span><div className="header-right"><span className="live-dot" /> {accounts.length} clientes<form method="post" action="/api/logout"><button className="small logout">Sair</button></form></div></header>
        {error && <div className="error" role="alert">{error}</div>}
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
        <div className="content">
          <div className="page-title">
            <div>
              <p className="eyebrow">PAINEL DO ADMINISTRADOR</p>
              <h1>{view}</h1>
              <p>{({ Clientes: 'Libere, acompanhe e controle o acesso de cada cliente.', Cobranças: 'Mensalidades atrasadas e vencendo nos próximos 7 dias.', 'Cadastro pelo site': 'Deixe novos clientes criarem a conta e pagarem sozinhos.', 'Minha conta': 'Altere a senha de acesso da administração.' })[view]}</p>
            </div>
            {view === 'Clientes' && <button className="primary" onClick={() => setCreating(true)}><Plus size={18} />Novo cliente</button>}
          </div>

          {loading ? <div className="empty">Carregando…</div> : view === 'Clientes' ? (
            <>
              <div className="stats admin-stats">
                {([
                  [UserCheck, 'Clientes ativos', String(active.length), `${accounts.length} no total`],
                  [Wallet, 'Receita mensal prevista', money(monthly), 'Soma das mensalidades ativas'],
                  [AlertTriangle, 'Em atraso', String(overdue.length), money(overdueTotal) + ' pendentes'],
                  [CalendarClock, 'Vencendo em 7 dias', String(dueSoon.length), 'Lembre os clientes'],
                  [Ban, 'Suspensos/bloqueados', String(inactive.length), 'Sem acesso ao painel'],
                ] as [typeof Users, string, string, string][]).map(([Icon, label, value, sub]) => (
                  <div className="stat" key={label}><div className="stat-top">{label}<Icon size={19} /></div><strong>{value}</strong><small>{sub}</small></div>
                ))}
              </div>
              <div className="toolbar">
                <div className="search"><Search size={17} /><input placeholder="Buscar negócio, nome, usuário ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="segmented">{FILTERS.map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
              </div>
              <section className="panel">
                <div className="table-scroll">
                  <table className="admin-table">
                    <thead><tr><th>Cliente</th><th>Usuário</th><th>Plano</th><th>Vencimento</th><th>Último pagamento</th><th>Último acesso</th><th>Situação</th><th /></tr></thead>
                    <tbody>
                      {shown.map((a) => (
                        <tr key={a.id} onClick={() => setOpenId(a.id)} className="clickable">
                          <td><b>{a.business_name}</b><small className="debt-sub">{[a.owner_name, a.segment].filter(Boolean).join(' · ') || '—'}</small></td>
                          <td>{a.username || '—'}</td>
                          <td>{a.plan || '—'}<small className="debt-sub">{a.monthly_fee ? money(a.monthly_fee) + '/mês' : 'Sem valor'}</small></td>
                          <td>{dateBR(a.next_due_date)}<small className="debt-sub">{a.billing_day ? 'Todo dia ' + a.billing_day : ''}</small></td>
                          <td>{dateBR(a.last_payment_date)}</td>
                          <td>{dateTimeBR(a.last_login_at)}</td>
                          <td><span className={badgeClass(a)}>{stateOf(a).label}</span></td>
                          <td><ChevronRight size={16} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!shown.length && <div className="empty"><Users size={30} /><p>{accounts.length ? 'Nenhum cliente neste filtro.' : 'Cadastre seu primeiro cliente.'}</p></div>}
              </section>
            </>
          ) : view === 'Cobranças' ? (
            <section className="panel">
              {charges.map((a) => (
                <div className="appointment" key={a.id}>
                  <div className="time"><b>{dateBR(a.next_due_date).slice(0, 5)}</b><small>{money(a.monthly_fee)}</small></div>
                  <div className="appointment-body"><b>{a.business_name}</b><p>{a.owner_name || a.username} · {a.contact_phone || 'sem telefone'}</p><span className={badgeClass(a)}>{stateOf(a).label}</span></div>
                  <div className="row-actions">
                    {whatsappLink(a) && <a className="icon" title="Cobrar pelo WhatsApp" href={whatsappLink(a)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /></a>}
                    <button className="small" onClick={() => setOpenId(a.id)}>Registrar pagamento</button>
                  </div>
                </div>
              ))}
              {!charges.length && <div className="empty"><Check size={30} /><h3>Tudo em dia</h3><p>Nenhuma mensalidade atrasada ou vencendo nos próximos 7 dias.</p></div>}
              <p className="footnote">Hoje: {dateBR(today)}. O WhatsApp abre com uma mensagem de lembrete pronta; você revisa e envia.</p>
              <p className="footnote">Pagamento automático (Pix Mercado Pago): <b>{mp ? 'conectado — os clientes pagam pelo painel e a baixa é automática' : 'não configurado — falta colocar as chaves na Vercel'}</b>.</p>
            </section>
          ) : view === 'Cadastro pelo site' ? (
            <SignupSettings pending={pendingSignups} onOpen={setOpenId} notify={notify} />
          ) : (
            <section className="panel settings"><h3>Trocar senha</h3><ChangePassword admin onDone={() => notify('Senha alterada')} /></section>
          )}
          <footer><ShieldCheck size={14} /> Painel Geral · Administração <span>Somente você tem acesso a esta área.</span></footer>
        </div>

        {creating && <NewAccount onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); notify('Cliente cadastrado'); await load(); }} />}
        {opened && <AccountSheet account={opened} onClose={() => setOpenId(null)} onChanged={async (msg) => { notify(msg); await load(); }} onDeleted={async () => { setOpenId(null); notify('Cliente removido'); await load(); }} />}
      </main>
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="icon" aria-label="Fechar" onClick={onClose}><X /></button></div>
        {children}
      </div>
    </div>
  );
}

function ProfileFields({ a }: { a?: Partial<Account> }) {
  return (
    <>
      <h3 className="form-section">Negócio</h3>
      <label>Nome do negócio<input name="business_name" defaultValue={a?.business_name} required /></label>
      <div className="form-grid">
        <label>Ramo de atividade<input name="segment" defaultValue={a?.segment} placeholder="Ex.: Manicure" /></label>
        <label>Nome do responsável<input name="owner_name" defaultValue={a?.owner_name} /></label>
        <label>WhatsApp / telefone<input name="contact_phone" type="tel" defaultValue={a?.contact_phone} /></label>
        <label>E-mail<input name="contact_email" type="email" defaultValue={a?.contact_email} /></label>
      </div>
      <h3 className="form-section">Assinatura</h3>
      <div className="form-grid">
        <label>Plano<input name="plan" defaultValue={a?.plan} placeholder="Ex.: Mensal" /></label>
        <label>Mensalidade (R$)<input name="monthly_fee" type="number" min="0" step="0.01" defaultValue={a?.monthly_fee ?? ''} /></label>
        <label>Dia de vencimento<input name="billing_day" type="number" min="1" max="31" defaultValue={a?.billing_day ?? ''} placeholder="1 a 31" /></label>
        <label>Início da assinatura<input name="start_date" type="date" defaultValue={a?.start_date ?? ''} /></label>
        <label>Próximo vencimento<input name="next_due_date" type="date" defaultValue={a?.next_due_date ?? ''} /></label>
        <label>Bloquear após (dias de atraso)<input name="auto_block_days" type="number" min="0" max="365" defaultValue={a?.auto_block_days ?? ''} placeholder="Vazio = nunca" /></label>
      </div>
      <label>Observações internas<textarea name="notes" rows={3} defaultValue={a?.notes} /></label>
    </>
  );
}

function formObject(form: HTMLFormElement) {
  const o: Record<string, unknown> = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v : ''; });
  return o;
}

function NewAccount({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = formObject(e.currentTarget);
    body.must_change_password = body.must_change_password === 'on';
    setBusy(true); setError('');
    try {
      await requestJSON('/api/admin/accounts', { method: 'POST', headers: json, body: JSON.stringify(body) });
      onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Novo cliente" eyebrow="LIBERAR ACESSO" onClose={onClose} wide>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit}>
        <ProfileFields />
        <p className="footnote">Se deixar o próximo vencimento em branco, ele é calculado pelo dia de vencimento a partir do início.</p>
        <h3 className="form-section">Acesso</h3>
        <div className="form-grid">
          <label>Usuário de login<input name="username" required autoCapitalize="none" spellCheck={false} placeholder="ex.: nathaly" /></label>
          <label>Senha inicial<input name="password" required /></label>
        </div>
        <div className="checks"><label><input type="checkbox" name="must_change_password" />Pedir para o cliente criar uma nova senha no primeiro acesso</label></div>
        <div className="modal-actions"><button type="button" className="small" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar cliente'}</button></div>
      </form>
    </Modal>
  );
}

function AccountSheet({ account: a, onClose, onChanged, onDeleted }: { account: Account; onClose: () => void; onChanged: (msg: string) => Promise<void>; onDeleted: () => void }) {
  const [tab, setTab] = useState<'Dados' | 'Pagamentos' | 'Acesso'>('Dados');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  const loadPayments = useCallback(async () => {
    try { setPayments((await requestJSON<{ payments: Payment[] }>(`/api/admin/accounts/${a.id}`)).payments); } catch (e) { setError((e as Error).message); }
  }, [a.id]);
  useEffect(() => { if (tab === 'Pagamentos') loadPayments(); }, [tab, loadPayments]);

  async function act(body: Record<string, unknown>, msg: string) {
    setBusy(true); setError('');
    try {
      await requestJSON(`/api/admin/accounts/${a.id}`, { method: 'PATCH', headers: json, body: JSON.stringify(body) });
      await onChanged(msg);
      if (body.action === 'payment' || body.action === 'delete-payment') await loadPayments();
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }

  async function remove() {
    const typed = prompt(`Para remover "${a.business_name}" e TODOS os dados dele (agenda, clientes, financeiro), digite o nome do negócio:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== a.business_name.trim().toLowerCase()) { setError('O nome digitado não confere. Nada foi removido.'); return; }
    setBusy(true);
    try { await requestJSON(`/api/admin/accounts/${a.id}`, { method: 'DELETE' }); onDeleted(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const s = stateOf(a);
  return (
    <Modal title={a.business_name} eyebrow="FICHA DO CLIENTE" onClose={onClose} wide>
      <div className="sheet-summary">
        <span className={badgeClass(a)}>{s.label}</span>
        <span>Usuário: <b>{a.username || '—'}</b></span>
        <span>Vencimento: <b>{dateBR(a.next_due_date)}</b></span>
        <span>Total pago: <b>{money(a.total_paid)}</b></span>
        <span>Último acesso: <b>{dateTimeBR(a.last_login_at)}</b></span>
        <span>Origem: <b>{a.signup_source === 'site' ? 'Cadastro pelo site' : 'Cadastrado por você'}</b></span>
        {a.referred_by_name && <span>Indicado por: <b>{a.referred_by_name}</b></span>}
      </div>
      {a.status !== 'ativo' && a.status_reason && <p className="footnote">Motivo: {a.status_reason}</p>}
      <div className="segmented sheet-tabs">{(['Dados', 'Pagamentos', 'Acesso'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setError(''); }}>{t}</button>)}</div>
      {error && <p className="error">{error}</p>}

      {tab === 'Dados' && (
        <form onSubmit={(e) => { e.preventDefault(); act({ action: 'update', ...formObject(e.currentTarget) }, 'Dados salvos'); }}>
          <ProfileFields a={a} />
          <label>Usuário de login<input name="username" defaultValue={a.username || ''} autoCapitalize="none" spellCheck={false} /></label>
          <div className="modal-actions"><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados'}</button></div>
        </form>
      )}

      {tab === 'Pagamentos' && (
        <>
          <form className="pay-form" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const o = formObject(form);
            if (await act({ action: 'payment', ...o, advance: o.advance === 'on' }, 'Pagamento registrado')) form.reset();
          }}>
            <h3 className="form-section">Registrar pagamento</h3>
            <div className="form-grid">
              <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={a.monthly_fee ?? ''} required /></label>
              <label>Data<input name="paid_at" type="date" defaultValue={todaySP()} required /></label>
              <label>Forma<select name="method" defaultValue="Pix"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Boleto</option><option>Transferência</option></select></label>
              <label>Observação<input name="note" placeholder="Ex.: referente a outubro" /></label>
            </div>
            <div className="checks"><label><input type="checkbox" name="advance" defaultChecked />Avançar o próximo vencimento em 1 mês{a.next_due_date ? ` (de ${dateBR(a.next_due_date)})` : ''}</label></div>
            <div className="modal-actions"><button className="primary" disabled={busy}>Registrar pagamento</button></div>
          </form>
          <h3 className="form-section">Histórico</h3>
          {payments === null ? <p className="footnote">Carregando…</p> : payments.length ? payments.map((p) => (
            <div className="appointment" key={p.id}>
              <div className="appointment-body"><b>{money(p.amount)} · {p.method || '—'}</b><p>{dateBR(p.paid_at)}{p.note ? ' · ' + p.note : ''}</p></div>
              <button className="icon" title="Excluir pagamento" disabled={busy} onClick={() => { if (confirm('Excluir este pagamento do histórico? O vencimento não é alterado.')) act({ action: 'delete-payment', payment_id: p.id }, 'Pagamento excluído'); }}><Trash2 size={16} /></button>
            </div>
          )) : <p className="footnote">Nenhum pagamento registrado.</p>}
        </>
      )}

      {tab === 'Acesso' && (
        <>
          <h3 className="form-section">Situação do acesso</h3>
          <p className="footnote">Suspenso e bloqueado tiram o acesso na hora (o cliente é desconectado). Os dados dele continuam guardados.</p>
          <label>Motivo (aparece só para você)<input id="status-reason" defaultValue={a.status_reason} placeholder="Ex.: pagamento em atraso" /></label>
          <div className="access-actions">
            <button className={'small' + (a.status === 'ativo' ? ' current' : '')} disabled={busy || a.status === 'ativo'} onClick={() => act({ action: 'status', status: 'ativo' }, 'Acesso liberado')}><ShieldCheck size={15} />{a.status === 'ativo' ? 'Ativo' : 'Desbloquear / reativar'}</button>
            <button className={'small' + (a.status === 'suspenso' ? ' current' : '')} disabled={busy || a.status === 'suspenso'} onClick={() => act({ action: 'status', status: 'suspenso', reason: (document.getElementById('status-reason') as HTMLInputElement)?.value }, 'Acesso suspenso')}><ShieldOff size={15} />Suspender</button>
            <button className={'small' + (a.status === 'bloqueado' ? ' current' : '')} disabled={busy || a.status === 'bloqueado'} onClick={() => act({ action: 'status', status: 'bloqueado', reason: (document.getElementById('status-reason') as HTMLInputElement)?.value }, 'Acesso bloqueado')}><Ban size={15} />Bloquear</button>
          </div>
          {a.auto_block_days != null && <p className="footnote">Bloqueio automático: o acesso é cortado após {a.auto_block_days} {a.auto_block_days === 1 ? 'dia' : 'dias'} de atraso e volta sozinho quando você registra o pagamento.</p>}

          <hr />
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const o = formObject(form);
            if (await act({ action: 'password', password: o.password, must_change_password: o.must_change_password === 'on' }, 'Senha redefinida')) form.reset();
          }}>
            <h3 className="form-section">Redefinir senha</h3>
            <label>Nova senha<input name="password" required /></label>
            <div className="checks"><label><input type="checkbox" name="must_change_password" />Pedir para o cliente criar uma nova senha no próximo acesso</label></div>
            <div className="modal-actions"><button className="primary" disabled={busy}><KeyRound size={15} />Redefinir senha</button></div>
          </form>

          <hr />
          <h3 className="form-section danger-text">Remover cliente</h3>
          <p className="footnote">Apaga o acesso e todos os dados do cliente (agenda, clientes, financeiro e pagamentos). Não dá para desfazer.</p>
          <button className="small danger" disabled={busy} onClick={remove}><Trash2 size={15} />Remover cliente</button>
        </>
      )}
    </Modal>
  );
}

type SignupCfg = { enabled: boolean; price: number; plan: string; autoBlockDays: number | null; headline: string };

function SignupSettings({ pending, onOpen, notify }: { pending: Account[]; onOpen: (id: string) => void; notify: (m: string) => void }) {
  const [cfg, setCfg] = useState<SignupCfg | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    requestJSON<{ config: SignupCfg }>('/api/admin/cadastro').then((r) => setCfg(r.config)).catch((e) => setError((e as Error).message));
  }, []);
  const url = origin + '/cadastro';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const r = await requestJSON<{ config: SignupCfg }>('/api/admin/cadastro', {
        method: 'PUT', headers: json,
        body: JSON.stringify({ enabled: f.get('enabled') === 'on', price: f.get('price'), plan: f.get('plan'), autoBlockDays: f.get('autoBlockDays') === '' ? null : f.get('autoBlockDays'), headline: f.get('headline') }),
      });
      setCfg(r.config);
      notify('Cadastro pelo site salvo');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!cfg) return <section className="panel">{error ? <p className="error">{error}</p> : <div className="empty">Carregando…</div>}</section>;
  return (
    <>
      <form className="panel settings" onSubmit={submit}>
        {error && <p className="error">{error}</p>}
        <h3>Cadastro de novos clientes pelo site</h3>
        <p className="footnote">Quem receber o link cria a própria conta e paga a primeira mensalidade por Pix. O acesso é liberado automaticamente quando o pagamento cai.</p>
        <div className="checks"><label><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} />Cadastro pelo site aberto</label></div>
        <div className="form-grid">
          <label>Mensalidade para novos clientes (R$)<input name="price" type="number" min="0" step="0.01" defaultValue={cfg.price || ''} placeholder="Ex.: 15,00" /></label>
          <label>Nome do plano<input name="plan" defaultValue={cfg.plan} /></label>
          <label>Bloquear após (dias de atraso)<input name="autoBlockDays" type="number" min="0" max="365" defaultValue={cfg.autoBlockDays ?? ''} placeholder="Vazio = nunca" /></label>
        </div>
        <label>Frase de destaque da página<input name="headline" defaultValue={cfg.headline} placeholder="Seu negócio organizado em um só lugar." /></label>
        <p className="field-label">Link da página de cadastro</p>
        <div className="link-box">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="small" onClick={async () => { try { await navigator.clipboard.writeText(url); notify('Link copiado'); } catch { /* sem permissão */ } }}><Copy size={13} />Copiar</button>
          <a className="small" href={url} target="_blank" rel="noopener noreferrer">Abrir</a>
          <a className="small" href={'https://wa.me/?text=' + encodeURIComponent('Conheça o Painel Geral: agenda, clientes e financeiro do seu negócio num só lugar. Crie sua conta aqui: ' + url)} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} />WhatsApp</a>
        </div>
        <p className="footnote">Seus clientes também ganham um link de indicação no painel deles (em Configurações). Quem se cadastrar por ele aparece aqui como &quot;Indicado por&quot;.</p>
        <div className="settings-actions"><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
      <section className="panel">
        <div className="section-heading"><h3><Hourglass size={15} /> Aguardando o primeiro pagamento</h3><span className="badge warn">{pending.length}</span></div>
        {pending.map((a) => (
          <div className="appointment clickable" key={a.id} onClick={() => onOpen(a.id)}>
            <div className="appointment-body"><b>{a.business_name}</b><p>{a.owner_name} · {a.contact_phone || 'sem telefone'} · criado em {dateTimeBR(a.created_at)}{a.referred_by_name ? ' · indicado por ' + a.referred_by_name : ''}</p></div>
            {whatsappLink(a) && <a className="icon" title="Chamar no WhatsApp" href={'https://wa.me/' + (a.contact_phone.replace(/\D/g, '').length <= 11 ? '55' : '') + a.contact_phone.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><MessageCircle size={18} /></a>}
            <ChevronRight size={16} />
          </div>
        ))}
        {!pending.length && <p className="footnote">Nenhum cadastro aguardando pagamento.</p>}
        <p className="footnote">Quem não pagou não entra no painel. Ao tentar entrar, a pessoa vê o Pix de novo. Para liberar sem pagamento, abra a ficha → Acesso → Desbloquear / reativar.</p>
      </section>
    </>
  );
}
