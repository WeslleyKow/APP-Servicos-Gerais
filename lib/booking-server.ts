import { randomUUID } from 'node:crypto';
import { pool, query } from './db';
import { accessAllowed } from './billing';
import { normalizeTheme, type ThemeSettings } from './theme';
import { bookableDays, bookingConfig, freeSlots, nowSP, onlyDigits, SLUG, toMinutes, type BookingConfig, type Busy, type WorkHours } from './booking';

type Item = Record<string, any>;
type Workspace = { clients?: Item[]; services?: Item[]; appointments?: Item[]; blocks?: Item[]; settings?: Item };

export class BookingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const DEFAULT_HOURS: WorkHours = { start: '08:00', end: '18:00', days: ['1', '2', '3', '4', '5', '6'] };

export type PublicService = { id: string; name: string; duration: number; price: number | null; category: string };
export type PublicPage = {
  slug: string; business: string; segment: string; welcome: string; theme: ThemeSettings; showPrices: boolean;
  services: PublicService[]; days: string[]; whatsapp: string; mode: 'auto' | 'manual';
};

type Loaded = { accountId: string; business: string; segment: string; data: Workspace; cfg: BookingConfig; hours: WorkHours };

async function load(slug: string, client: { query: typeof query } | null = null): Promise<Loaded> {
  if (!SLUG.test(slug)) throw new BookingError('Link de agendamento não encontrado.', 404);
  const q = client ? client.query.bind(client) : query;
  const r = await q<{ id: string; business_name: string; segment: string; status: string; next_due_date: string | null; auto_block_days: number | null; data: Workspace | null }>(
    `select a.id, a.business_name, a.segment, a.status, a.next_due_date, a.auto_block_days, w.data
       from accounts a left join workspaces w on w.account_id = a.id
      where a.booking_slug = $1`,
    [slug],
  );
  const a = r.rows[0];
  if (!a) throw new BookingError('Link de agendamento não encontrado.', 404);
  const data: Workspace = a.data || {};
  const cfg = bookingConfig(data.settings?.booking);
  if (!cfg.enabled || !accessAllowed({ status: a.status, next_due_date: a.next_due_date, auto_block_days: a.auto_block_days })) {
    throw new BookingError('A agenda online deste negócio está indisponível no momento.', 410);
  }
  const s = data.settings || {};
  const hours: WorkHours = {
    start: /^\d\d:\d\d$/.test(s.start) ? s.start : DEFAULT_HOURS.start,
    end: /^\d\d:\d\d$/.test(s.end) ? s.end : DEFAULT_HOURS.end,
    days: Array.isArray(s.days) ? s.days.map(String) : DEFAULT_HOURS.days,
  };
  return { accountId: a.id, business: String(s.business || a.business_name), segment: String(s.segment ?? a.segment ?? ''), data, cfg, hours };
}

function servicesOf(l: Loaded): Item[] {
  return (l.data.services || []).filter((s) => s.active !== false && !l.cfg.hiddenServices.includes(s.id) && Number(s.duration) > 0);
}

export async function publicPage(slug: string): Promise<PublicPage> {
  const l = await load(slug);
  return {
    slug, business: l.business, segment: l.segment, welcome: l.cfg.welcome, theme: normalizeTheme(l.data.settings?.theme), showPrices: l.cfg.showPrices,
    services: servicesOf(l).map((s) => ({ id: s.id, name: String(s.name), duration: Number(s.duration), price: l.cfg.showPrices ? Number(s.price) || 0 : null, category: String(s.category || '') }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    days: bookableDays(l.hours, l.cfg), whatsapp: onlyDigits(l.cfg.whatsapp), mode: l.cfg.mode,
  };
}

async function busyFor(l: Loaded, date: string, q: typeof query): Promise<Busy[]> {
  const busy: Busy[] = [];
  for (const a of l.data.appointments || []) {
    if (a.date === date && a.status !== 'Cancelado' && /^\d\d:\d\d/.test(a.time)) busy.push({ start: toMinutes(a.time), end: toMinutes(a.time) + (Number(a.duration) || 0) });
  }
  for (const b of l.data.blocks || []) {
    if (b.date === date && /^\d\d:\d\d/.test(b.time) && /^\d\d:\d\d/.test(b.end)) busy.push({ start: toMinutes(b.time), end: toMinutes(b.end) });
  }
  // Agendamentos pelo link que o painel ainda não importou.
  const known = new Set((l.data.appointments || []).map((a) => a.id));
  const pending = await q<{ id: string; time: string; duration: number }>("select id, time, duration from bookings where account_id = $1 and date = $2 and status <> 'cancelado'", [l.accountId, date]);
  for (const p of pending.rows) if (!known.has(p.id)) busy.push({ start: toMinutes(p.time), end: toMinutes(p.time) + p.duration });
  return busy;
}

export async function availability(slug: string, date: string, serviceId: string): Promise<string[]> {
  const l = await load(slug);
  const service = servicesOf(l).find((s) => s.id === serviceId);
  if (!service) throw new BookingError('Serviço indisponível.');
  return freeSlots(date, Number(service.duration), l.hours, await busyFor(l, date, query), l.cfg);
}

export type BookingInput = { serviceId?: unknown; date?: unknown; time?: unknown; name?: unknown; phone?: unknown; website?: unknown };

/** Cria o agendamento com trava por negócio: dois clientes nunca ficam com o mesmo horário. */
export async function createBooking(slug: string, input: BookingInput) {
  if (input.website) throw new BookingError('Não foi possível agendar.'); // campo isca contra robôs
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  const phone = onlyDigits(input.phone).slice(0, 13);
  const date = String(input.date || ''), time = String(input.time || ''), serviceId = String(input.serviceId || '');
  if (name.length < 2) throw new BookingError('Informe seu nome.');
  if (phone.length < 10 || phone.length > 13) throw new BookingError('Informe um WhatsApp válido com DDD.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new BookingError('Escolha o dia e o horário.');

  const client = await pool().connect();
  try {
    await client.query('begin');
    const l = await load(slug, client as unknown as { query: typeof query });
    await client.query('select pg_advisory_xact_lock(hashtext($1))', ['booking:' + l.accountId]);
    const service = servicesOf(l).find((s) => s.id === serviceId);
    if (!service) throw new BookingError('Serviço indisponível.');
    const recent = await client.query("select count(*)::int as n from bookings where account_id = $1 and right(phone, 10) = right($2, 10) and created_at > now() - interval '1 day'", [l.accountId, phone]);
    if (recent.rows[0].n >= 3) throw new BookingError('Você já fez vários agendamentos hoje. Fale com o estabelecimento pelo WhatsApp.', 429);
    const q = client.query.bind(client) as unknown as typeof query;
    const slots = freeSlots(date, Number(service.duration), l.hours, await busyFor(l, date, q), l.cfg);
    if (!slots.includes(time)) throw new BookingError('Esse horário acabou de ser ocupado. Escolha outro, por favor.', 409);
    const id = randomUUID();
    await client.query(
      'insert into bookings (id, account_id, service_id, service_name, price, duration, date, time, name, phone) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, l.accountId, service.id, String(service.name), Number(service.price) || 0, Number(service.duration), date, time, name, phone],
    );
    await client.query('commit');
    return { id, business: l.business, service: String(service.name), duration: Number(service.duration), price: l.cfg.showPrices ? Number(service.price) || 0 : null, date, time, mode: l.cfg.mode, whatsapp: onlyDigits(l.cfg.whatsapp) };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------- Lado do prestador ----------

export type NewBooking = { id: string; service_id: string; service_name: string; price: number; duration: number; date: string; time: string; name: string; phone: string; created_at: string };

export async function newBookings(accountId: string): Promise<NewBooking[]> {
  const r = await query<NewBooking>("select id, service_id, service_name, price, duration, date, time, name, phone, created_at from bookings where account_id = $1 and status = 'novo' order by created_at", [accountId]);
  return r.rows;
}

/** O painel confirma que já colocou esses agendamentos na agenda. */
export async function ackBookings(accountId: string, ids: unknown) {
  if (!Array.isArray(ids) || !ids.length) return;
  await query("update bookings set status = 'importado' where account_id = $1 and id = any($2::text[])", [accountId, ids.map(String).slice(0, 200)]);
}

export async function getSlug(accountId: string): Promise<string | null> {
  return (await query<{ booking_slug: string | null }>('select booking_slug from accounts where id = $1', [accountId])).rows[0]?.booking_slug ?? null;
}

export async function setSlug(accountId: string, slugRaw: unknown): Promise<string> {
  const slug = String(slugRaw || '').trim().toLowerCase();
  if (!SLUG.test(slug)) throw new BookingError('O endereço deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen (sem começar ou terminar com hífen).');
  const taken = await query('select 1 from accounts where booking_slug = $1 and id <> $2', [slug, accountId]);
  if (taken.rowCount) throw new BookingError('Esse endereço já está em uso por outro negócio. Escolha outro.');
  await query('update accounts set booking_slug = $2 where id = $1', [accountId, slug]);
  return slug;
}
