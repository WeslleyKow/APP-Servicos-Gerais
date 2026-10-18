import ts from 'typescript';import fs from 'node:fs';import assert from 'node:assert/strict';
const code=ts.transpileModule(fs.readFileSync('lib/request.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {requestJSON}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.fetch=async()=>new Response('{"version":3}',{status:200});assert.equal((await requestJSON('/api/state')).version,3);
globalThis.fetch=async()=>new Response('{"error":"Conflito"}',{status:409});await assert.rejects(requestJSON('/api/state'),/Conflito/);
globalThis.fetch=async()=>new Response('<html>Login</html>');await assert.rejects(requestJSON('/api/state'),/resposta inesperada/);
globalThis.fetch=async()=>new Promise(()=>{});await assert.rejects(requestJSON('/api/state',{},20),/demorou/);
globalThis.fetch=async()=>({ok:true,text:()=>new Promise(()=>{})});await assert.rejects(requestJSON('/api/state',{},20),/demorou/);
console.log('Salvamento: sucesso, erro, resposta inválida, requisição travada e corpo travado passaram.');
