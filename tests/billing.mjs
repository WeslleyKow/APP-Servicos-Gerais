import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const code = ts.transpileModule(fs.readFileSync('lib/billing.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const b = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

// Próximo vencimento mantém o dia de cobrança, ajustando meses curtos.
assert.equal(b.addMonth('2026-01-31', 31), '2026-02-28');
assert.equal(b.addMonth('2026-02-28', 31), '2026-03-31');
assert.equal(b.addMonth('2028-01-30', 30), '2028-02-29');
assert.equal(b.addMonth('2026-12-10', 10), '2027-01-10');
assert.equal(b.addMonth('2026-05-15'), '2026-06-15');

// Primeiro vencimento.
assert.equal(b.firstDue('2026-10-05', 10), '2026-10-10');
assert.equal(b.firstDue('2026-10-15', 10), '2026-11-10');
assert.equal(b.firstDue('2026-10-10', 10), '2026-10-10');
assert.equal(b.firstDue('2026-02-10', 31), '2026-02-28');
assert.equal(b.firstDue('2026-10-15', null), '2026-10-15');

// Situação da cobrança.
const today = '2026-10-18';
assert.equal(b.billingState({ status: 'ativo', next_due_date: '2026-10-15', auto_block_days: null }, today).label, 'Atrasado 3 dias');
assert.equal(b.billingState({ status: 'ativo', next_due_date: '2026-10-18', auto_block_days: null }, today).label, 'Vence hoje');
assert.equal(b.billingState({ status: 'ativo', next_due_date: '2026-10-19', auto_block_days: null }, today).label, 'Vence em 1 dia');
assert.equal(b.billingState({ status: 'ativo', next_due_date: '2026-11-30', auto_block_days: null }, today).key, 'emdia');
assert.equal(b.billingState({ status: 'ativo', next_due_date: null, auto_block_days: null }, today).key, 'sem');
assert.equal(b.billingState({ status: 'suspenso', next_due_date: '2026-11-30', auto_block_days: null }, today).label, 'Suspenso');

// Liberação de acesso e bloqueio automático por atraso.
assert.equal(b.accessAllowed({ status: 'ativo', next_due_date: '2026-10-01', auto_block_days: null }, today), true);
assert.equal(b.accessAllowed({ status: 'ativo', next_due_date: '2026-10-10', auto_block_days: 10 }, today), true);
assert.equal(b.accessAllowed({ status: 'ativo', next_due_date: '2026-10-07', auto_block_days: 10 }, today), false);
assert.equal(b.accessAllowed({ status: 'bloqueado', next_due_date: null, auto_block_days: null }, today), false);

assert.equal(b.isDate('2026-02-30'), false);
assert.equal(b.isDate('2028-02-29'), true);
assert.equal(b.isDate('18/10/2026'), false);
assert.equal(b.todaySP(new Date('2026-10-18T02:00:00Z')), '2026-10-17');

// Pagamento automático: cobre o período e tira do atraso.
assert.equal(b.nextDueAfterPayment('2026-10-10', 10, '2026-10-18'), '2026-11-10');
assert.equal(b.nextDueAfterPayment('2026-11-10', 10, '2026-10-18'), '2026-12-10');
assert.equal(b.nextDueAfterPayment('2026-07-10', 10, '2026-10-18'), '2026-11-10');
assert.equal(b.nextDueAfterPayment('2026-07-18', 18, '2026-10-18'), '2026-11-18');
assert.equal(b.nextDueAfterPayment(null, null, '2026-10-18'), '2026-11-18');

console.log('Assinatura: vencimentos, situação e bloqueio automático passaram.');
