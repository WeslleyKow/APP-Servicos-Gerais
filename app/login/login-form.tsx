'use client';
import { useState } from 'react';
import { LayoutDashboard, LogIn } from 'lucide-react';
import { requestJSON } from '../../lib/request';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await requestJSON('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(f.get('username') || ''), password: String(f.get('password') || '') }),
      });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
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
        <label>Usuário<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary" disabled={busy}><LogIn size={17} />{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
