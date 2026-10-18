// Regras de assinatura e vencimento (sem dependências, testadas em tests/billing.mjs).

export type AccountStatus = 'ativo' | 'suspenso' | 'bloqueado' | 'pendente';
export const STATUSES: AccountStatus[] = ['ativo', 'suspenso', 'bloqueado', 'pendente'];
export const STATUS_LABELS: Record<string, string> = { ativo: 'Ativo', suspenso: 'Suspenso', bloqueado: 'Bloqueado', pendente: 'Aguardando 1º pagamento' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DATE.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const fmt = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Data de hoje em São Paulo (AAAA-MM-DD). */
export function todaySP(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Dias entre duas datas (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);
}

/** Vencimento no mês seguinte, mantendo o dia de cobrança (ajusta para meses mais curtos). */
export function addMonth(date: string, billingDay?: number | null): string {
  const [y, m, d] = date.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 0 : m;
  const day = Math.min(billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : d, daysInMonth(ny, nm));
  return fmt(ny, nm, day);
}

/** Primeiro vencimento a partir da data de início: próximo dia de cobrança igual ou após o início. */
export function firstDue(start: string, billingDay?: number | null): string {
  if (!billingDay) return start;
  const [y, m] = start.split('-').map(Number);
  const thisMonth = fmt(y, m - 1, Math.min(billingDay, daysInMonth(y, m - 1)));
  return thisMonth >= start ? thisMonth : addMonth(thisMonth, billingDay);
}

export type Billing = { status: string; next_due_date: string | null; auto_block_days: number | null };

/** Situação da cobrança para exibição. */
export function billingState(a: Billing, today = todaySP()): { key: 'inativo' | 'sem' | 'atrasado' | 'vencendo' | 'emdia'; label: string; days: number } {
  if (a.status !== 'ativo') return { key: 'inativo', label: STATUS_LABELS[a.status] || 'Bloqueado', days: 0 };
  if (!a.next_due_date) return { key: 'sem', label: 'Sem cobrança', days: 0 };
  const diff = daysBetween(today, a.next_due_date);
  if (diff < 0) return { key: 'atrasado', label: `Atrasado ${-diff} ${diff === -1 ? 'dia' : 'dias'}`, days: -diff };
  if (diff === 0) return { key: 'vencendo', label: 'Vence hoje', days: 0 };
  if (diff <= 7) return { key: 'vencendo', label: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`, days: diff };
  return { key: 'emdia', label: 'Em dia', days: diff };
}

/** O acesso do cliente está liberado? (status ativo e sem bloqueio automático por atraso) */
export function accessAllowed(a: Billing, today = todaySP()): boolean {
  if (a.status !== 'ativo') return false;
  if (a.auto_block_days == null || !a.next_due_date) return true;
  return daysBetween(a.next_due_date, today) <= a.auto_block_days;
}

/** Próximo vencimento após um pagamento automático: cobre o período atual e nunca deixa o cliente ainda em atraso. */
export function nextDueAfterPayment(nextDue: string | null, billingDay: number | null, today = todaySP()): string {
  let next = addMonth(nextDue || today, billingDay);
  if (next <= today) {
    const [y, m, d] = today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    next = firstDue(tomorrow, billingDay || d);
  }
  return next;
}
