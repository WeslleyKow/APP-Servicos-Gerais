// Regras do link de agendamento (sem dependências; testadas em tests/booking.mjs).

export type BookingConfig = {
  enabled: boolean;
  mode: 'auto' | 'manual';
  minNoticeHours: number;
  maxDaysAhead: number;
  step: number;
  showPrices: boolean;
  hiddenServices: string[];
  welcome: string;
  whatsapp: string;
};

export const DEFAULT_BOOKING: BookingConfig = {
  enabled: true,
  mode: 'auto',
  minNoticeHours: 2,
  maxDaysAhead: 30,
  step: 30,
  showPrices: true,
  hiddenServices: [],
  welcome: '',
  whatsapp: '',
};

export function bookingConfig(raw: unknown): BookingConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<BookingConfig>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : def;
  };
  return {
    enabled: r.enabled !== false,
    mode: r.mode === 'manual' ? 'manual' : 'auto',
    minNoticeHours: num(r.minNoticeHours, DEFAULT_BOOKING.minNoticeHours, 0, 168),
    maxDaysAhead: num(r.maxDaysAhead, DEFAULT_BOOKING.maxDaysAhead, 1, 180),
    step: [10, 15, 20, 30, 45, 60].includes(Number(r.step)) ? Number(r.step) : DEFAULT_BOOKING.step,
    showPrices: r.showPrices !== false,
    hiddenServices: Array.isArray(r.hiddenServices) ? r.hiddenServices.map(String) : [],
    welcome: typeof r.welcome === 'string' ? r.welcome.slice(0, 300) : '',
    whatsapp: typeof r.whatsapp === 'string' ? r.whatsapp.slice(0, 30) : '',
  };
}

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** Compara telefones pelos últimos 10 dígitos (ignora +55 e o 9 extra não é removido). */
export const samePhone = (a: unknown, b: unknown) => {
  const x = onlyDigits(a), y = onlyDigits(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-10) === y.slice(-10);
};

/** Data (AAAA-MM-DD) e minuto do dia agora em São Paulo. */
export function nowSP(now = new Date()): { date: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (date: string) => String(new Date(date + 'T12:00:00Z').getUTCDay());

export type WorkHours = { start: string; end: string; days: string[] };
export type Busy = { start: number; end: number };

/** Dias em que o cliente pode agendar (de hoje até o limite, só dias de atendimento). */
export function bookableDays(hours: WorkHours, cfg: BookingConfig, now = nowSP()): string[] {
  const out: string[] = [];
  for (let i = 0; i <= cfg.maxDaysAhead; i++) {
    const d = addDays(now.date, i);
    if (hours.days.includes(weekday(d))) out.push(d);
  }
  return out;
}

/** Horários livres para um serviço em um dia, descontando expediente, ocupações e antecedência mínima. */
export function freeSlots(date: string, duration: number, hours: WorkHours, busy: Busy[], cfg: BookingConfig, now = nowSP()): string[] {
  if (!bookableDays(hours, cfg, now).includes(date) || !(duration > 0)) return [];
  const open = toMinutes(hours.start), close = toMinutes(hours.end);
  const earliest = date === now.date ? now.minutes + cfg.minNoticeHours * 60 : date < now.date ? Infinity : -Infinity;
  // Antecedência que passa da meia-noite também vale para o dia seguinte.
  const spill = now.minutes + cfg.minNoticeHours * 60 - 1440;
  const earliestNext = date === addDays(now.date, 1) && spill > 0 ? spill : -Infinity;
  const out: string[] = [];
  for (let t = open; t + duration <= close; t += cfg.step) {
    if (t < earliest || t < earliestNext) continue;
    if (busy.some((b) => t < b.end && t + duration > b.start)) continue;
    out.push(toTime(t));
  }
  return out;
}
