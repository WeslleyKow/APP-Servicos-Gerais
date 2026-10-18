# Nathaly Manicure

Código-fonte da versão atual: agenda, clientes, serviços, pacotes, financeiro, notinhas com pagamentos parciais e seleção com busca.

Não inclui dados cadastrados, banco de dados, credenciais ou dependências instaladas.

## Instalação
Requer Node.js >=22.13 e pnpm.

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node tests/notinha.mjs
node tests/request.mjs
pnpm run dev
```

Aplique as migrações da pasta drizzle ao D1 local antes de usar o sistema. Consulte DOCUMENTACAO-BASE.md para os comandos de migração e configuração do runtime.

## Hospedagem e autenticação
O código depende de Cloudflare Workers, D1 (binding DB) e autenticação do ChatGPT Sites. O identificador do Site foi removido desta cópia. Para outra hospedagem, configure seu próprio banco e substitua app/chatgpt-auth.ts por autenticação segura, protegendo as rotas da API também. Não é um HTML independente.

A tabela workspace armazena o estado e sua versão; o arquivo de migração cria apenas a estrutura, sem registros. A API fica em app/api/state/route.ts.

## WhatsApp
Mensagens pré-preenchidas para envio manual. Automação de envios não está implementada.

## Código
app: telas, autenticação e API. lib: cálculos e requisições. db/drizzle: estrutura e migrações. tests: testes. build/scripts: runtime e compilação.
