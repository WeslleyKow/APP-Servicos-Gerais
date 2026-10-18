import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const code = ts.transpileModule(fs.readFileSync('lib/booking.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const b = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const hours = { start: '08:00', end: '12:00', days: ['1', '2', '3', '4', '5', '6'] }; // seg-sáb
const cfg = b.bookingConfig({ step: 60, minNoticeHours: 2, maxDaysAhead: 7 });
const now = { date: '2026-10-19', minutes: 8 * 60 + 30 }; // segunda, 08:30

// Configuração com padrões e limites.
assert.deepEqual(b.bookingConfig(null), b.DEFAULT_BOOKING);
assert.equal(b.bookingConfig({ step: 7 }).step, 30);
assert.equal(b.bookingConfig({ mode: 'manual' }).mode, 'manual');

// Dias: pula domingo, respeita limite.
const days = b.bookableDays(hours, cfg, now);
assert.equal(days[0], '2026-10-19');
assert.ok(!days.includes('2026-10-25'), 'domingo fora');
assert.equal(days.at(-1), '2026-10-26');

// Hoje: antecedência de 2h a partir de 08:30 → primeiro horário 11:00 (passo de 60).
assert.deepEqual(b.freeSlots('2026-10-19', 60, hours, [], cfg, now), ['11:00']);
// Amanhã: todos os horários; serviço de 90 min não passa do fim do expediente.
assert.deepEqual(b.freeSlots('2026-10-20', 60, hours, [], cfg, now), ['08:00', '09:00', '10:00', '11:00']);
assert.deepEqual(b.freeSlots('2026-10-20', 90, hours, [], cfg, now), ['08:00', '09:00', '10:00']);
// Ocupações (atendimento 09:00-10:00 e bloqueio 10:30-11:00).
const busy = [{ start: 540, end: 600 }, { start: 630, end: 660 }];
assert.deepEqual(b.freeSlots('2026-10-20', 60, hours, busy, b.bookingConfig({ step: 30, minNoticeHours: 0 }), now), ['08:00', '11:00']);
// Domingo, passado e além do limite: nada.
assert.deepEqual(b.freeSlots('2026-10-25', 60, hours, [], cfg, now), []);
assert.deepEqual(b.freeSlots('2026-10-18', 60, hours, [], cfg, now), []);
assert.deepEqual(b.freeSlots('2026-11-30', 60, hours, [], cfg, now), []);
// Antecedência que vira a noite: 23:00 + 10h → amanhã só a partir das 09:00.
assert.deepEqual(b.freeSlots('2026-10-20', 60, hours, [], b.bookingConfig({ step: 60, minNoticeHours: 10 }), { date: '2026-10-19', minutes: 23 * 60 }), ['09:00', '10:00', '11:00']);

// Telefones e horário de São Paulo.
assert.equal(b.samePhone('(11) 98888-7777', '+55 11 98888-7777'), true);
assert.equal(b.samePhone('11988887777', '11977776666'), false);
assert.deepEqual(b.nowSP(new Date('2026-10-19T02:30:00Z')), { date: '2026-10-18', minutes: 23 * 60 + 30 });
assert.equal(b.SLUG.test('nathaly-manicure'), true);
assert.equal(b.SLUG.test('-ruim'), false);

console.log('Agendamento: dias, horários livres, antecedência e conflitos passaram.');
