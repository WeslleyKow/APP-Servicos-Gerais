'use client';
import { useCallback, useRef, useState } from 'react';
import { LayoutDashboard, LogIn } from 'lucide-react';
import { requestJSON } from '../../lib/request';
import PixPay from '../pix-pay';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payToken, setPayToken] = useState('');
  const creds = useRef({ username: '', password: '' });

  const doLogin = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const r = await requestJSON<{ redirect?: string }>('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds.current),
      });
      window.location.href = r.redirect || '/';
    } catch (err) {
      const body = (err as { body?: { payToken?: string } }).body;
      setPayToken(body?.payToken || '');
      setError((err as Error).message);
      setBusy(false);
    }
  }, []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    creds.current = { username: String(f.get('username') || ''), password: String(f.get('password') || '') };
    doLogin();
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-symbol"><LayoutDashboard size={30} /></span>
          <div>Painel Geral<small>AGENDA · CLIENTES · VENDAS</small></div>
        </div>
        <h1>Entrar</h1>
        <p>Acesse o painel do seu negócio.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        {payToken ? (
          <PixPay payToken={payToken} onPaid={doLogin} />
        ) : (
          <>
            <label>Usuário<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus /></label>
            <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="primary" disabled={busy}><LogIn size={17} />{busy ? 'Entrando…' : 'Entrar'}</button>
          </>
        )}
      </form>
    </div>
  );
}
