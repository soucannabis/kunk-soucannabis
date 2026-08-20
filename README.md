# Kunk

Sistema open source de gestão associativa para cannabis medicinal.

Aplicações especializadas atendem os diferentes papéis da associação e compartilham uma API central sobre PostgreSQL. Termos e assinaturas fazem parte do próprio produto.

| Sistema | Função |
|---|---|
| **Cadastro de Associados** (`apps/registration`) | Adesão, documentos, dados clínicos, termos e acompanhamento |
| **Assinatura de termos** (`apps/doc-sign`) | Termos e documentos com assinaturas auditáveis |
| **Kunk** (`apps/kunk`) | Painel operacional: acolhimento, triagem, serviços, pedidos e relatórios |
| **Área Admin** (`apps/admin`) | Configuração da instância, cadastros, usuários e integrações |
| **API** (`kunk-api`) | Autenticação, dados, regras de negócio, arquivos e integrações |

Módulos de terceiros (frete, pagamentos, calendário, etc.) vêm **desabilitados por padrão** e são ativados no Admin.

## Requisitos

- Node.js ≥ 18
- PostgreSQL

## Quick start

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
Com Docker da API: `http://localhost:4250/api/v1/health`

Dados de exemplo:

```bash
npm run seed:sample --prefix kunk-api
```

### Frontends

Na raiz do monorepo (com a API no ar):

```bash
npm run dev:registration   # cad — :4255
npm run dev:admin          # admin — :4256
npm run dev:kunk           # app — :4257
npm run dev:doc-sign       # termos — :4258
```

Os apps falam com `/api/v1` no próprio host (proxy Vite → API em `:8056` por padrão).
Se a API estiver no Docker (`:4250`), exporte `VITE_API_PROXY_TARGET=http://localhost:4250`.

Stack unificada (API + apps):

```bash
npm run docker:kunk
```

## Documentação

Site oficial: [https://kunksoucannabis.ong.br/](https://kunksoucannabis.ong.br/)

Código-fonte do site: [soucannabis/kunk-soucannabis-docs](https://github.com/soucannabis/kunk-soucannabis-docs).

READMEs por app: `apps/*/README.md` e [`kunk-api/README.md`](./kunk-api/README.md).

## Estrutura do repositório

| Caminho | Função |
|---|---|
| `apps/registration/` | Cadastro de Associados |
| `apps/doc-sign/` | Assinatura de termos |
| `apps/kunk/` | Painel operacional |
| `apps/admin/` | Área Admin |
| `kunk-api/` | API REST (PostgreSQL) |
| `packages/` | UI, tema, auth, forms, api-client, etc. |
| `deploy/spa/` | Empacotamento/deploy dos frontends |
| `docker-compose.kunk.yml` | Stack local unificada |

## Licença

Este projeto é distribuído sob a [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0).

## Contribuição

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) e o [Código de Conduta](./CODE_OF_CONDUCT.md). Para vulnerabilidades, use [SECURITY.md](./SECURITY.md).

Abra issues e pull requests em [soucannabis/kunksoucannabis-open](https://github.com/soucannabis/kunksoucannabis-open). Preferência: mudanças pequenas, com testes na API (`npm test` em `kunk-api`) quando o comportamento mudar.
