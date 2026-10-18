'use client';
import { useCallback, useRef, useState } from 'react';
import { CalendarDays, Check, LayoutDashboard, Palette, Users, Wallet, Link2, UserPlus } from 'lucide-react';
import { requestJSON } from '../../lib/request';
import PixPay from '../pix-pay';

type Info = { enabled: boolean; price: number; plan: string; headline: string; payOnline: boolean; referrer: string | null } | null;

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

const FEATURES: [typeof CalendarDays, string][] = [
  [CalendarDays, 'Agenda com horários, bloqueios e lembretes por WhatsApp'],
  [Link2, 'Link para seus clientes agendarem sozinhos'],
  [Users, 'Cadastro de clientes com histórico'],
  [Wallet, 'Financeiro, notinhas (fiado) e pacotes'],
  [Palette, 'Do seu jeito: cores, textos e gráficos'],
];

export default function SignupForm({ info, refCode }: { info: Info; refCode: string | null }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [touchedUser, setTouchedUser] = useState(false);
  const [payToken, setPayToken] = useState('');
  const [waiting, setWaiting] = useState(false);
  const creds = useRef({ username: '', password: '' });

  const enterPanel = useCallback(async () => {
    try {
      const r = await requestJSON<{ redirect?: string }>('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds.current) });
      window.location.href = r.redirect || '/';
    } catch {
      window.location.href = '/login';
    }
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') || '');
    if (password !== String(f.get('confirm') || '')) { setError('A confirmação da senha não confere.'); return; }
    setBusy(true); setError('');
    try {
      const r = await requestJSON<{ payToken: string | null }>('/api/cadastro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: f.get('business_name'), segment: f.get('segment'), owner_name: f.get('owner_name'), contact_phone: phone,
          contact_email: f.get('contact_email'), username, password, ref: refCode, website: f.get('website'),
        }),
      }, 20000);
      creds.current = { username, password };
      if (r.payToken) setPayToken(r.payToken); else setWaiting(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signup-page">
      <section className="signup-pitch">
        <div className="login-brand"><span className="brand-symbol"><LayoutDashboard size={30} /></span><div>Painel Geral<small>AGENDA · CLIENTES · VENDAS</small></div></div>
        <h1>{info?.headline || 'Seu negócio organizado em um só lugar.'}</h1>
        {info?.referrer && <p className="signup-ref"><UserPlus size={15} /> Indicado por <b>{info.referrer}</b></p>}
        <ul className="signup-features">{FEATURES.map(([Icon, t]) => <li key={t}><Icon size={17} />{t}</li>)}</ul>
        {info?.enabled && <div className="signup-price"><small>Plano {info.plan}</small><strong>{money(info.price)}<span>/mês</span></strong><small>Pagamento por Pix · acesso liberado na hora</small></div>}
      </section>

      <section className="login-card signup-card">
        {!info?.enabled ? (
          <><h1>Cadastro fechado</h1><p>No momento não estamos abrindo novas contas pelo site. Fale com a gente pelo WhatsApp ou tente mais tarde.</p><a className="link" href="/login">Já tenho conta → Entrar</a></>
        ) : waiting ? (
          <div className="pix-box paid"><Check size={34} /><h3>Cadastro recebido!</h3><p>Sua conta será liberada em breve. Você receberá o aviso pelo WhatsApp.</p></div>
        ) : payToken ? (
          <>
            <h1>Último passo</h1>
            <p>Pague a primeira mensalidade com Pix. Assim que o pagamento cair, você entra no seu painel automaticamente.</p>
            <PixPay payToken={payToken} onPaid={enterPanel} />
          </>
        ) : (
          <form onSubmit={submit}>
            <h1>Criar minha conta</h1>
            <p>Leva 1 minuto. Depois é só pagar o Pix e começar a usar.</p>
            {error && <p className="login-error" role="alert">{error}</p>}
            <label>Nome do seu negócio<input name="business_name" required maxLength={120} onChange={(e) => { if (!touchedUser) setUsername(slugify(e.target.value)); }} placeholder="Ex.: Studio Bela Unha" /></label>
            <div className="form-grid">
              <label>Ramo de atividade<input name="segment" maxLength={120} placeholder="Ex.: Manicure" /></label>
              <label>Seu nome<input name="owner_name" required maxLength={120} autoComplete="name" /></label>
              <label>WhatsApp<input name="contact_phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 98888-7777" /></label>
              <label>E-mail<input name="contact_email" type="email" autoComplete="email" /></label>
            </div>
            <label>Usuário para entrar<input name="username" required value={username} autoCapitalize="none" spellCheck={false} onChange={(e) => { setTouchedUser(true); setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')); }} placeholder="seunegocio" /></label>
            <div className="form-grid">
              <label>Senha<input name="password" type="password" required minLength={6} autoComplete="new-password" /></label>
              <label>Confirme a senha<input name="confirm" type="password" required autoComplete="new-password" /></label>
            </div>
            <input name="website" className="book-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button className="primary" disabled={busy}><UserPlus size={17} />{busy ? 'Criando conta…' : `Criar conta e pagar ${money(info.price)}`}</button>
            <p className="footnote signup-login">Já tem conta? <a href="/login">Entrar</a></p>
          </form>
        )}
      </section>
    </div>
  );
}
