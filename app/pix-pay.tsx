'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, QrCode, RefreshCw } from 'lucide-react';
import { requestJSON } from '../lib/request';

type Charge = { id: string; amount: number; status: string; qr_code: string; qr_base64: string; ticket_url: string; expires_at: string };
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/** Gera o Pix da mensalidade, mostra o QR Code e avisa assim que o pagamento é confirmado. */
export default function PixPay({ payToken, onPaid }: { payToken?: string; onPaid: () => void }) {
  const [charge, setCharge] = useState<Charge | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const done = useRef(false);

  async function generate() {
    setBusy(true); setError(''); setStatus('');
    try {
      const r = await requestJSON<{ charge: Charge }>('/api/assinatura/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payToken }) }, 30000);
      setCharge(r.charge);
      setStatus(r.charge.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!charge || status !== 'pending') return;
    const t = setInterval(async () => {
      try {
        const q = new URLSearchParams({ id: charge.id, ...(payToken ? { payToken } : {}) });
        const r = await requestJSON<{ status: string }>('/api/assinatura/pix?' + q.toString(), {}, 20000);
        setStatus(r.status);
        if (r.status === 'paid' && !done.current) { done.current = true; setTimeout(onPaid, 1200); }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 4000);
    return () => clearInterval(t);
  }, [charge, status, payToken, onPaid]);

  async function copy() {
    if (!charge) return;
    try { await navigator.clipboard.writeText(charge.qr_code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ }
  }

  if (status === 'paid') return <div className="pix-box paid"><Check size={34} /><h3>Pagamento confirmado!</h3><p>Seu acesso está liberado.</p></div>;

  return (
    <div className="pix-box">
      {error && <p className="login-error" role="alert">{error}</p>}
      {!charge ? (
        <button type="button" className="primary" disabled={busy} onClick={generate}><QrCode size={17} />{busy ? 'Gerando Pix…' : 'Pagar mensalidade com Pix'}</button>
      ) : status === 'pending' ? (
        <>
          <p className="pix-amount">{money(charge.amount)}</p>
          {charge.qr_base64 && <img className="pix-qr" src={'data:image/png;base64,' + charge.qr_base64} alt="QR Code Pix" width={210} height={210} />}
          <p className="footnote">Abra o app do seu banco, escolha <b>Pix → Ler QR Code</b> ou use o <b>Pix Copia e Cola</b>:</p>
          <div className="pix-copy"><input readOnly value={charge.qr_code} onFocus={(e) => e.currentTarget.select()} aria-label="Código Pix copia e cola" /><button type="button" className="small" onClick={copy}>{copied ? <><Check size={14} />Copiado</> : <><Copy size={14} />Copiar</>}</button></div>
          <p className="pix-wait"><span className="live-dot" /> Aguardando o pagamento… a liberação é automática.</p>
          <p className="footnote">Válido até {new Date(charge.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}.</p>
        </>
      ) : (
        <>
          <p className="footnote">Este Pix expirou ou foi cancelado.</p>
          <button type="button" className="small" onClick={() => { setCharge(null); generate(); }}><RefreshCw size={14} />Gerar novo Pix</button>
        </>
      )}
    </div>
  );
}
