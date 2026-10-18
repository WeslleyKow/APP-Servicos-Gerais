# Painel Geral

Painel para qualquer vendedor ou prestador de serviço: agenda, clientes, serviços, pacotes, notinhas (vendas fiado com pagamentos parciais) e financeiro. Cada cliente do painel entra com o próprio login e vê apenas os próprios dados, com o nome do negócio dele em todo o sistema.

## Hospedagem
- **Site:** Vercel (cada envio para a branch `main` é publicado automaticamente).
- **Banco:** Neon (PostgreSQL), ligado à Vercel pela variável `DATABASE_URL`.
- As tabelas são criadas automaticamente no primeiro acesso.

## Conta de teste
| Usuário | Senha | Negócio |
|---|---|---|
| `nathaly` | `nathaly` | Nathaly Manicure |

## Desenvolvimento
Requer Node.js >= 22.13 e um PostgreSQL.

```sh
npm install
DATABASE_URL=postgres://... npm run dev
npm run typecheck && npm test
```

O GitHub Actions (`.github/workflows/ci.yml`) roda checagem de tipos, testes, build e um teste ponta a ponta de login e salvamento em cada envio.

## Código
- `app/painel.tsx` — telas do painel.
- `app/login/` — tela de login.
- `app/api/` — login, logout e dados (`state`).
- `lib/db.ts` — conexão, tabelas e contas de teste.
- `lib/auth.ts`, `lib/password.ts` — sessões e senhas (scrypt).
- `lib/notinha.ts` — cálculo de saldos e pagamentos.
