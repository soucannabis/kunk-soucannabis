# Kunk API

API REST nativa do Kunk open source (PostgreSQL).

Documentação do contrato: [https://kunksoucannabis.ong.br/](https://kunksoucannabis.ong.br/) (código em [kunk-soucannabis-docs](https://github.com/soucannabis/kunk-soucannabis-docs)).

## Desenvolvimento

```bash
cp .env.example .env
# Defina PG_URL (ou PGHOST/PG*) para o Postgres do schema alvo
npm install
npm run dev
```

Base URL local (npm): `http://localhost:8056/api/v1` 
Base URL Docker: `http://localhost:4250/api/v1`

## Docker (hot reload)

Sobe a API na porta **4250** com volume do código local e reinício automático via nodemon:

```bash
cp .env.example .env   # se ainda não tiver
# PG_URL (ou PGHOST/PG*) no .env
docker compose up --build -d
curl http://localhost:4250/api/v1/health
```

Alterações em `src/` reiniciam o processo automaticamente.

```bash
docker compose logs -f kunk-api
docker compose down
```

## Sample data

```bash
npm run seed:sample            # truncate + popula o banco
npm run seed:sample:generate   # só gera fixtures/*.json
```

Detalhes e login demo: [`sample-data/README.md`](./sample-data/README.md).

## Insomnia (testes manuais)

Importe [`insomnia/kunk-api.insomnia.json`](./insomnia/kunk-api.insomnia.json) — ver [`insomnia/README.md`](./insomnia/README.md).

## Testes

```bash
npm test
npm run test:unit
npm run test:integration
```

Toda feature nova deve incluir testes. `npm test` deve passar antes de considerar a entrega pronta.

### Suites live de frete (Loggi / Melhor Envio)

Arquivos `tests/integration/modules/*.live.test.js` **não** rodam no `npm test` padrão.
Só executam quando **ambas** as flags estiverem `true`:

```bash
RUN_LIVE_FREIGHT_TESTS=true npm test -- tests/integration/modules/loggi.live.test.js
RUN_LIVE_FREIGHT_TESTS=true npm test -- tests/integration/modules/melhorenvio.live.test.js
```

Também é necessário ter o módulo ativo no Admin, credenciais (`system_api_credentials` ou env) e configs de Loja
(`store.ship_from`, `store.freight.package`, `store.freight.content_declaration`) preenchidas.
Módulos permanecem **desabilitados** por default (só Admin ativa via `system_configs`).

