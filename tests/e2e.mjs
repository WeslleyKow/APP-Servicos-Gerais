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

console.log('e2e ok');
