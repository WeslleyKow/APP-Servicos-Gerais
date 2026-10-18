'use client';
import { useState } from 'react';
import { CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronLeft, Clock, MessageCircle, Store } from 'lucide-react';
import { requestJSON } from '../../../lib/request';
import type { PublicPage, PublicService } from '../../../lib/booking-server';

type Done = { business: string; service: string; duration: number; price: number | null; date: string; time: string; mode: 'auto' | 'manual'; whatsapp: string };

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dayLabel = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return { week: dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), day: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') };
};
const longDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

function icsFile(b: Done) {
  const [y, m, d] = b.date.split('-').map(Number);
  const [hh, mm] = b.time.split(':').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, hh + 3, mm)); // São Paulo = UTC-3
  const end = new Date(start.getTime() + b.duration * 60_000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Painel Geral//PT-BR', 'BEGIN:VEVENT', `UID:${f(start)}-${Math.random().toString(36).slice(2)}@painelgeral`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${b.service} · ${b.business}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'agendamento.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function BookingFlow({ page }: { page: PublicPage }) {
  const [service, setService] = useState<PublicService | null>(null);
  const [day, setDay] = useState('');
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const step = done ? 5 : !service ? 1 : !day ? 2 : !time ? 3 : 4;

  async function loadTimes(d: string, s = service) {
    if (!s) return;
    setDay(d); setTime(''); setTimes(null); setError('');
    try {
      const r = await requestJSON<{ times: string[] }>(`/api/agendar/${page.slug}?date=${d}&service=${encodeURIComponent(s.id)}`);
      setTimes(r.times);
    } catch (e) { setError((e as Error).message); setTimes([]); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service) return;
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const r = await requestJSON<{ booking: Done }>(`/api/agendar/${page.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: service.id, date: day, time, name: f.get('name'), phone, website: f.get('website') }),
      }, 20000);
      setDone(r.booking);
    } catch (err) {
      setError((err as Error).message);
      if ((err as { status?: number }).status === 409) loadTimes(day);
    } finally { setBusy(false); }
  }

  const back = () => { setError(''); if (time) setTime(''); else if (day) { setDay(''); setTimes(null); } else setService(null); };
  const whatsappText = done && encodeURIComponent(`Olá! Acabei de agendar pelo link: ${done.service} em ${longDate(done.date)}, às ${done.time}.`);

  return (
    <div className="book-card">
      <header className="book-head">
        <span className="brand-symbol"><Store size={26} /></span>
        <div><h1>{page.business}</h1>{page.segment && <small>{page.segment.toUpperCase()}</small>}</div>
      </header>

      {done ? (
        <div className="book-done">
          <span className="book-ok"><Check size={30} /></span>
          <h2>{done.mode === 'auto' ? 'Agendamento confirmado!' : 'Pedido enviado!'}</h2>
          <p>{done.mode === 'auto' ? 'Seu horário está reservado.' : 'O estabelecimento vai confirmar seu horário em breve.'}</p>
          <div className="book-summary">
            <div><Store size={16} /><b>{done.service}</b>{done.price != null && <span>{money(done.price)}</span>}</div>
            <div><CalendarDays size={16} />{longDate(done.date)}</div>
            <div><Clock size={16} />{done.time} · {duration(done.duration)}</div>
          </div>
          {done.whatsapp && <a className="primary book-btn" href={`https://wa.me/${done.whatsapp.length <= 11 ? '55' + done.whatsapp : done.whatsapp}?text=${whatsappText}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />Avisar pelo WhatsApp</a>}
          <button className="small book-btn" onClick={() => icsFile(done)}><CalendarPlus size={15} />Adicionar ao meu calendário</button>
          <button className="link book-again" onClick={() => { setDone(null); setService(null); setDay(''); setTime(''); setTimes(null); }}>Fazer outro agendamento</button>
        </div>
      ) : (
        <>
          <p className="book-welcome">{page.welcome || 'Escolha o serviço, o dia e o horário. Leva menos de um minuto.'}</p>
          <ol className="book-steps" aria-label="Etapas">{['Serviço', 'Dia', 'Horário', 'Seus dados'].map((s, i) => <li key={s} className={step > i + 1 ? 'done' : step === i + 1 ? 'on' : ''}>{s}</li>)}</ol>
          {step > 1 && <button className="link book-back" onClick={back}><ChevronLeft size={15} />Voltar</button>}
          {error && <p className="login-error" role="alert">{error}</p>}

          {step === 1 && (
            page.services.length ? (
              <div className="book-list">
                {page.services.map((s) => (
                  <button key={s.id} className="book-option" onClick={() => { setService(s); setError(''); }}>
                    <div><b>{s.name}</b><small>{duration(s.duration)}{s.category ? ' · ' + s.category : ''}</small></div>
                    {s.price != null && <span>{money(s.price)}</span>}
                  </button>
                ))}
              </div>
            ) : <p className="book-empty">Nenhum serviço disponível para agendamento online no momento.</p>
          )}

          {step === 2 && service && (
            <>
              <p className="book-picked"><b>{service.name}</b> · {duration(service.duration)}</p>
              <div className="book-days">
                {page.days.map((d) => { const l = dayLabel(d); return <button key={d} className="book-day" onClick={() => loadTimes(d)}><small>{l.week}</small><b>{l.day}</b></button>; })}
              </div>
              {!page.days.length && <p className="book-empty">Sem dias disponíveis no momento.</p>}
            </>
          )}

          {step === 3 && service && (
            <>
              <p className="book-picked"><b>{service.name}</b> · {longDate(day)}</p>
              {times === null ? <p className="book-empty">Buscando horários…</p> : times.length ? (
                <div className="book-times">{times.map((t) => <button key={t} className="book-time" onClick={() => setTime(t)}>{t}</button>)}</div>
              ) : <p className="book-empty">Não há horários livres neste dia. Escolha outro dia.</p>}
            </>
          )}

          {step === 4 && service && (
            <form onSubmit={submit} className="book-form">
              <div className="book-summary">
                <div><Store size={16} /><b>{service.name}</b>{service.price != null && <span>{money(service.price)}</span>}</div>
                <div><CalendarCheck size={16} />{longDate(day)} às {time}</div>
              </div>
              <label>Seu nome<input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>
              <label>Seu WhatsApp<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 98888-7777" /></label>
              <input name="website" className="book-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <button className="primary book-btn" disabled={busy}><CalendarCheck size={17} />{busy ? 'Agendando…' : 'Confirmar agendamento'}</button>
            </form>
          )}
        </>
      )}
      <footer className="book-foot">Agendamento online · Painel Geral</footer>
    </div>
  );
}
