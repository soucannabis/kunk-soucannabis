# Sample data — Kunk OSS

Dados **fictícios** para popular o schema alvo em demos e instalação com sample data.

## Contagens (demo)

| Tabela | Qtd |
|---|---:|
| users | 100 |
| orders | 50 |
| institutional_clients | 10 |
| professionals | 10 |
| products | 5 |
| services | 20 |
| reception | 15 |
| tags | 8 |
| reports | 3 |
| files + junctions | 5 / 5 / 5 / 3 |
| users_api | 0 (sem token de API) |

**Operadores (`system_users`) não entram no sample.** Cadastre pelo Admin ou API. Scripts de seed/`clean:db` não criam operadores.

Para testes automatizados use `admin@kunk-api.test` / `TestAdmin123!` (`ensureAdminUser` nos helpers de teste).

**Importante:** a suíte `npm test` **não** faz TRUNCATE das tabelas de negócio (sample data permanece). Só `npm run seed:sample` / `seed:load` trunca ao reinstalar o seed (preserva `system_users`).

Associados do demo (não-`patient`) alternam fases do funil: `cadastro_criado`, `dados_pessoais`, `documentos`, `assinatura_termo`, `concluido` — com `status` `Associado` ou `cadastro_criado`, e uma fatia com `invalid_fields` (problema no cadastro).

## Como rodar (demo)

Com `PG_URL (ou PGHOST/PG*)` definido em `kunk-api/.env`:

```bash
cd kunk-api
npm run seed:sample
```

Isso **trunca** as tabelas de negócio (ordem segura de FKs) e reinsere o sample. **Não** altera `system_users`.

Somente gerar JSON em `fixtures/` (sem gravar no banco):

```bash
npm run seed:sample:generate
```

## Sample data de carga (stress)

Para testar listagens e filtros com volume alto, use inserts em lote (sem fixtures JSON):

```bash
cd kunk-api
npm run seed:load:smoke          # 500 users — valida o script
npm run seed:load                # medium (default): 5k users / 10k pedidos
npm run seed:load:medium
npm run seed:load -- --profile=large --yes
npm run seed:load -- --profile=xlarge --yes
```

| Perfil | users | orders | services | reception |
|---|---:|---:|---:|---:|
| smoke | 500 | 800 | 200 | 150 |
| medium | 5 000 | 10 000 | 3 000 | 2 000 |
| large | 20 000 | 50 000 | 12 000 | 8 000 |
| xlarge | 50 000 | 120 000 | 30 000 | 15 000 |

Overrides: `--users=2000 --orders=4000 --batch=500`. 
~20% dos users são pacientes (`status=patient`) ligados a responsáveis. 
Os demais distribuem fases do funil (`cadastro_criado`, `dados_pessoais`, `documentos`, `assinatura_termo`, `concluido`) e `status` Associado / em andamento — inclusive alguns com `invalid_fields` (problema no cadastro). 
Preserva `system_users`, `system_configs` e `system_api_credentials`.

## Política

- Dados de produção nunca devem ser usados como fonte de dump; o sample é 100% fictício.
- **Todos os campos** de cada tabela do `target-schema.sql` (exceto `system_users`) são preenchidos no seed demo.
- Cada registro do seed grava `is_sample = true`. Dados criados pelo uso normal ficam com `is_sample = false` (default).
- No admin (**Dados** → Excluir dados de exemplo) é possível remover só as linhas com `is_sample = true`.
- Produtos: 5 linhas (`Linha CBD`, `THC`, `CBG`, `CBC`, `CBN`) com SKU `KNK-*` e concentrações em **mg**.
- CPFs/emails/telefones são inventados e claramente de demo.
- Associados sample **não têm senha**; não há token de API de demonstração.
- `reception.status` usa os valores OSS da triagem (`waiting` / `done`), alinhados a `triage.statuses`.
