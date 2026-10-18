'use client';
import { receipts } from '../lib/notinha';

type Item = Record<string, any>;
type Data = { appointments: Item[]; entries: Item[] };

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const compact = (v: number) => (v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : money(v));
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function Columns({ items, format }: { items: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="chart-columns">
      {items.map((i) => (
        <div className="chart-col" key={i.label} title={i.label + ': ' + format(i.value)}>
          <small>{i.value ? format(i.value) : ''}</small>
          <div className="chart-track"><span style={{ height: max ? Math.max(3, (i.value / max) * 100) + '%' : '0%' }} /></div>
          <b>{i.label}</b>
        </div>
      ))}
    </div>
  );
}

function Rows({ items, format }: { items: { label: string; value: number; tone?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="chart-rows">
      {items.map((i) => (
        <div className="chart-row" key={i.label}>
          <div className="chart-row-label"><span>{i.label}</span><b>{format(i.value)}</b></div>
          <div className="chart-bar"><span className={i.tone || ''} style={{ width: max ? Math.max(2, (i.value / max) * 100) + '%' : '0%' }} /></div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, empty, children }: { title: string; subtitle: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="panel chart-panel">
      <div className="section-heading"><div><h3>{title}</h3><p>{subtitle}</p></div></div>
      {empty ? <p className="chart-empty">Ainda não há dados suficientes para este gráfico.</p> : children}
    </section>
  );
}

export function RevenueChart({ data, today }: { data: Data; today: string }) {
  const [y, m] = today.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] };
  });
  const paid = data.entries.filter((e) => e.kind === 'Entrada').flatMap(receipts);
  const items = months.map((mo) => ({ label: mo.label, value: paid.filter((p: Item) => String(p.date).startsWith(mo.key)).reduce((s: number, p: Item) => s + Number(p.amount || 0), 0) }));
  return (
    <Panel title="Recebido por mês" subtitle="Pagamentos recebidos nos últimos 6 meses" empty={!items.some((i) => i.value)}>
      <Columns items={items} format={compact} />
    </Panel>
  );
}

export function ServicesChart({ data }: { data: Data }) {
  const counts = new Map<string, number>();
  for (const a of data.appointments) if (a.status === 'Concluído') counts.set(a.serviceName || 'Serviço', (counts.get(a.serviceName || 'Serviço') || 0) + 1);
  const items = [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  return (
    <Panel title="Serviços mais realizados" subtitle="Atendimentos concluídos, top 5" empty={!items.length}>
      <Rows items={items} format={(v) => v + (v === 1 ? ' atendimento' : ' atendimentos')} />
    </Panel>
  );
}

export function WeekdayChart({ data, today }: { data: Data; today: string }) {
  const start = new Date(today + 'T12:00:00');
  start.setDate(start.getDate() - 56);
  const from = start.toISOString().slice(0, 10);
  const counts = Array(7).fill(0);
  for (const a of data.appointments) if (a.status !== 'Cancelado' && a.date >= from && a.date <= today) counts[new Date(a.date + 'T12:00:00').getDay()]++;
  const items = WEEK.map((label, i) => ({ label, value: counts[i] }));
  return (
    <Panel title="Movimento por dia da semana" subtitle="Atendimentos das últimas 8 semanas" empty={!counts.some(Boolean)}>
      <Columns items={items} format={(v) => String(v)} />
    </Panel>
  );
}

export function CashChart({ data, today }: { data: Data; today: string }) {
  const month = today.slice(0, 7);
  const sum = (kind: string) => data.entries.filter((e) => e.kind === kind && String(e.date).startsWith(month)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const inc = sum('Entrada'), out = sum('Despesa');
  return (
    <Panel title="Entradas x despesas" subtitle={'Mês atual · saldo ' + money(inc - out)} empty={!inc && !out}>
      <Rows items={[{ label: 'Entradas', value: inc }, { label: 'Despesas', value: out, tone: 'out' }]} format={money} />
    </Panel>
  );
}
