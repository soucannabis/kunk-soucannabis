# apps/registration

App de **cadastramento** (funil de associados) — React + Vite + JavaScript.

## Subir local (sem Docker)

1. API em `http://localhost:8056` (`cd kunk-api && npm run dev`). Com Docker da API, use `:4250` e `VITE_API_PROXY_TARGET=http://localhost:4250`.
2. Na raiz do monorepo: `npm install`
3. `npm run dev:registration` → [http://localhost:4255](http://localhost:4255)

Copie `.env.example` → `.env` e ajuste `VITE_API_URL` se necessário.

## Docker (porta 4255 + hot reload)

```bash
cd apps/registration
cp .env.example .env
# Se a API roda no host: VITE_API_URL=http://host.docker.internal:4250/api/v1
docker compose up --build
```

Abra [http://localhost:4255](http://localhost:4255). Volumes montam `src/` e `packages/` para hot reload.

## Rotas

| Rota | Fase |
|---|---|
| `/cadastro`, `/login`, `/nova-senha` | pública |
| `/bem-vindo` | 1 |
| `/cadastro-associado` | 1–2 |
| `/cadastro-paciente` | 2 (`another`) |
| `/documentos` | 3–4 (fase 4 = stub termos) |
| `/finalizar` | Associado (pós-termo) |
| `/cadastro-concluido` | concluído |

Sessão: cookie HttpOnly `associate_session` na API (não no localStorage).

## Testes E2E (Playwright)

Pré-requisitos: API em `http://localhost:8056` (ou Docker `:4250`) e (opcional) front já em `:4255`.

```bash
# na raiz
npm run test:e2e

# ou
cd apps/registration && npx playwright test
npx playwright test --ui
```

Specs em `e2e/`: auth, forms do funil, documentos RG/CNH, fase 4 stub, fase 5, guards.

Documentação escrita de cada caso (dados, APIs, asserts): [`e2e/VALIDATION.md`](./e2e/VALIDATION.md).
