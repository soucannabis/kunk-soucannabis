# Contribuindo com o Kunk

Obrigado pelo interesse em contribuir. Este repositório é o monorepo OSS do Kunk (AGPL-3.0).

## Documentação

Site oficial: [https://kunksoucannabis.ong.br/](https://kunksoucannabis.ong.br/)

## Ambiente local

Requisitos: Node.js ≥ 18 e PostgreSQL.

```bash
git clone https://github.com/soucannabis/kunksoucannabis-open.git
cd kunksoucannabis-open
npm install
```

### API

```bash
cd kunk-api
cp .env.example .env
# Ajuste PG_URL ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE
npm install
npm run dev
```

Health check: `http://localhost:8056/api/v1/health`

### Um frontend (com a API no ar)

Na raiz do monorepo:

```bash
npm run dev:kunk          # painel operacional
npm run dev:admin         # área Admin
npm run dev:registration  # cadastro
npm run dev:doc-sign      # assinatura de termos
```

## Testes

- API (unitário + integração/contract): `npm test` em `kunk-api`, ou `npm run test:api` na raiz
- Unitários da API: `npm run test:unit --prefix kunk-api`
- App Kunk: `npm run test:kunk`
- E2E: `npm run test:e2e`, `npm run test:e2e:admin`, `npm run test:e2e:kunk`, etc.

Altere ou adicione testes quando o comportamento da API ou da UI mudar.

## Pull requests

- Prefira PRs pequenos e focados
- Descreva o problema e a solução
- Inclua testes quando fizer sentido
- Não commit secrets (`.env`, chaves, tokens)

## Licença

Ao contribuir, você concorda que o código entra sob a [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0).

## Código de Conduta

Participação neste projeto está sujeita ao [Código de Conduta](./CODE_OF_CONDUCT.md).
