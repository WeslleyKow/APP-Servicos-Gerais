// Teste ponta a ponta: exige o site rodando (npm start) com DATABASE_URL configurada.
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:3000';
const json = { 'Content-Type': 'application/json' };
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

// Sem login: página inicial manda para /login e a API recusa.
let r = await fetch(base + '/', { redirect: 'manual' });
assert.ok([302, 303, 307, 308].includes(r.status), 'home sem login deveria redirecionar, veio ' + r.status);
assert.match(r.headers.get('location') || '', /\/login$/);
r = await fetch(base + '/api/state');
assert.equal(r.status, 401);
r = await fetch(base + '/login');
assert.equal(r.status, 200);
assert.match(await r.text(), /Entrar/);

// Senha errada.
r = await fetch(base + '/api/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'nathaly', password: 'errada' }) });
assert.equal(r.status, 401);
assert.equal((await r.json()).error, 'Usuário ou senha incorretos.');

// Login correto (usuário sem diferenciar maiúsculas).
r = await fetch(base + '/api/login', { method: 'POST', headers: json, body: JSON.stringify({ username: ' Nathaly ', password: 'nathaly' }) });
assert.equal(r.status, 200, 'login nathaly/nathaly deveria funcionar');
const cookie = cookieOf(r);
assert.match(cookie, /^painel_sessao=.+/);
const auth = { cookie };

// Painel mostra o negócio da cliente logada.
r = await fetch(base + '/', { headers: auth });
assert.equal(r.status, 200);
const html = await r.text();
assert.match(html, /Nathaly Manicure/);
assert.match(html, /Painel Geral/);

// Ler, salvar e conflito de versão.
r = await fetch(base + '/api/state', { headers: auth });
assert.equal(r.status, 200);
const state = await r.json();
const data = { clients: [{ id: 'c1', name: 'Maria' }], services: [], packages: [], sales: [], appointments: [], entries: [], blocks: [], settings: { business: 'Nathaly Manicure' } };
r = await fetch(base + '/api/state', { method: 'PUT', headers: { ...json, ...auth }, body: JSON.stringify({ data, version: state.version }) });
assert.equal(r.status, 200);
const saved = await r.json();
assert.equal(saved.version, state.version + 1);
r = await fetch(base + '/api/state', { method: 'PUT', headers: { ...json, ...auth }, body: JSON.stringify({ data, version: state.version }) });
assert.equal(r.status, 409);
r = await fetch(base + '/api/state', { headers: auth });
assert.equal((await r.json()).data.clients[0].name, 'Maria');

// Outro site não pode salvar (CSRF).
r = await fetch(base + '/api/state', { method: 'PUT', headers: { ...json, ...auth, origin: 'https://site-malicioso.example' }, body: JSON.stringify({ data, version: saved.version }) });
assert.equal(r.status, 403);

// Sair encerra a sessão.
r = await fetch(base + '/api/logout', { method: 'POST', headers: auth, redirect: 'manual' });
assert.equal(r.status, 303);
r = await fetch(base + '/api/state', { headers: auth });
assert.equal(r.status, 401);

// ---------- Administração ----------
const post = (path, body, cookie, method = 'POST') => fetch(base + path, { method, headers: { ...json, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const loginAs = (username, password) => post('/api/login', { username, password });

// Primeiro acesso do admin exige troca de senha.
r = await loginAs('admin', 'admin');
assert.equal(r.status, 200, 'admin/admin deveria entrar');
assert.equal((await r.json()).redirect, '/admin');
const admin = cookieOf(r);
r = await fetch(base + '/api/admin/accounts', { headers: { cookie: admin } });
assert.equal(r.status, 401, 'admin sem trocar senha não acessa a API');
r = await fetch(base + '/admin', { headers: { cookie: admin } });
assert.match(await r.text(), /Crie sua senha/);
r = await post('/api/conta/senha', { current: 'admin', next: 'curta' }, admin);
assert.equal(r.status, 400);
r = await post('/api/conta/senha', { current: 'admin', next: 'senha-admin-123' }, admin);
assert.equal(r.status, 200);
r = await fetch(base + '/', { headers: { cookie: admin }, redirect: 'manual' });
assert.match(r.headers.get('location') || '', /\/admin$/);

// Cliente não acessa a API do admin.
r = await loginAs('nathaly', 'nathaly');
const nat = cookieOf(r);
r = await fetch(base + '/api/admin/accounts', { headers: { cookie: nat } });
assert.equal(r.status, 401);

// Lista e cadastro.
r = await fetch(base + '/api/admin/accounts', { headers: { cookie: admin } });
assert.equal(r.status, 200);
assert.ok((await r.json()).accounts.some((a) => a.username === 'nathaly'));
const novo = { business_name: 'Barbearia Teste', segment: 'Barbearia', owner_name: 'João', username: 'Barbearia', password: '123', monthly_fee: '49.90', billing_day: '10', start_date: '2026-10-05', next_due_date: '', auto_block_days: '' };
r = await post('/api/admin/accounts', novo, admin);
assert.equal(r.status, 200, 'cadastro de cliente');
const { id } = await r.json();
r = await post('/api/admin/accounts', novo, admin);
assert.equal(r.status, 400, 'usuário duplicado');
const getAcc = async () => (await (await fetch(base + '/api/admin/accounts', { headers: { cookie: admin } })).json()).accounts.find((a) => a.id === id);
let acc = await getAcc();
assert.equal(acc.next_due_date, '2026-10-10');
assert.equal(acc.monthly_fee, 49.9);
assert.equal(acc.username, 'barbearia');

// Cliente novo entra e vê o próprio negócio.
r = await loginAs('barbearia', '123');
assert.equal(r.status, 200);
let barb = cookieOf(r);
r = await fetch(base + '/', { headers: { cookie: barb } });
assert.match(await r.text(), /Barbearia Teste/);

// Suspender corta o acesso na hora; reativar libera.
r = await post(`/api/admin/accounts/${id}`, { action: 'status', status: 'suspenso', reason: 'teste' }, admin, 'PATCH');
assert.equal(r.status, 200);
r = await fetch(base + '/api/state', { headers: { cookie: barb } });
assert.equal(r.status, 401);
r = await loginAs('barbearia', '123');
assert.equal(r.status, 403);
assert.match((await r.json()).error, /suspenso/);
r = await post(`/api/admin/accounts/${id}`, { action: 'status', status: 'ativo' }, admin, 'PATCH');
r = await loginAs('barbearia', '123');
assert.equal(r.status, 200);

// Pagamento avança o vencimento.
r = await post(`/api/admin/accounts/${id}`, { action: 'payment', amount: '49.90', paid_at: '2026-10-09', method: 'Pix', advance: true }, admin, 'PATCH');
assert.equal(r.status, 200);
acc = await getAcc();
assert.equal(acc.next_due_date, '2026-11-10');
assert.equal(acc.last_payment_date, '2026-10-09');
assert.equal(acc.total_paid, 49.9);
r = await fetch(base + `/api/admin/accounts/${id}`, { headers: { cookie: admin } });
assert.equal((await r.json()).payments.length, 1);

// Redefinir senha.
r = await post(`/api/admin/accounts/${id}`, { action: 'password', password: 'nova', must_change_password: false }, admin, 'PATCH');
assert.equal(r.status, 200);
assert.equal((await loginAs('barbearia', '123')).status, 401);
assert.equal((await loginAs('barbearia', 'nova')).status, 200);

// Bloqueio automático por atraso.
r = await post(`/api/admin/accounts/${id}`, { action: 'update', ...novo, username: 'barbearia', next_due_date: '2020-01-01', auto_block_days: '5' }, admin, 'PATCH');
assert.equal(r.status, 200);
r = await loginAs('barbearia', 'nova');
assert.equal(r.status, 403);
assert.match((await r.json()).error, /atraso/);
r = await post(`/api/admin/accounts/${id}`, { action: 'update', ...novo, username: 'barbearia', next_due_date: '2099-01-01', auto_block_days: '5' }, admin, 'PATCH');

// Bloqueio após 5 senhas erradas.
for (let i = 0; i < 5; i++) assert.equal((await loginAs('barbearia', 'errada')).status, 401);
assert.equal((await loginAs('barbearia', 'nova')).status, 429);

// Remover.
r = await fetch(base + `/api/admin/accounts/${id}`, { method: 'DELETE', headers: { cookie: admin } });
assert.equal(r.status, 200);
assert.equal(await getAcc(), undefined);

console.log('e2e ok');
