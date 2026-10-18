'use client';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { requestJSON } from '../lib/request';

/** Troca de senha. Com `forced`, ocupa a tela inteira (primeiro acesso). */
export default function ChangePassword({ forced = false, title, admin = false, onDone }: { forced?: boolean; title?: string; admin?: boolean; onDone?: () => void }) {
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const next = String(f.get('next') || '');
    setError(''); setOk('');
    if (next !== String(f.get('confirm') || '')) { setError('A confirmação não é igual à nova senha.'); return; }
    setBusy(true);
    try {
      await requestJSON('/api/conta/senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: String(f.get('current') || ''), next }) });
      if (forced) { window.location.reload(); return; }
      form.reset();
      setOk('Senha alterada com sucesso.');
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fields = (
    <>
      {error && <p className="login-error" role="alert">{error}</p>}
      {ok && <p className="login-ok" role="status">{ok}</p>}
      <label>Senha atual<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>Nova senha<input name="next" type="password" autoComplete="new-password" required minLength={admin ? 8 : undefined} /></label>
      <label>Confirme a nova senha<input name="confirm" type="password" autoComplete="new-password" required /></label>
      {admin && <p className="footnote">Mínimo de 8 caracteres. Use uma senha que você não usa em outros sites.</p>}
      <button className="primary" disabled={busy}><KeyRound size={16} />{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
    </>
  );

  if (!forced) return <form className="password-form" onSubmit={submit}>{fields}</form>;
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Crie sua senha</h1>
        <p>{title ? title + ' · ' : ''}Por segurança, defina uma nova senha para continuar.</p>
        {fields}
      </form>
      <form method="post" action="/api/logout" className="login-exit"><button className="link">Sair</button></form>
    </div>
  );
}
