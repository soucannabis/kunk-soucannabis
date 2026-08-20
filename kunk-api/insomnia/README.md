# Insomnia — Kunk API

Collection para testes manuais da API em `http://localhost:4250/api/v1`.

## Importar

1. Abra o Insomnia
2. **Application → Preferences → Data → Import Data** (ou *Create → Import*)
3. Selecione [`kunk-api.insomnia.json`](./kunk-api.insomnia.json)
4. Confirme o workspace **Kunk API**

## Ambiente

| Variável | Valor padrão |
|---|---|
| `base_url` | `http://localhost:4250/api/v1` |
| `email` | *(operador criado no Admin — não há seed de system_users)* |
| `password` | *(senha do operador)* |
| `bearer_token` | *(token criado no Admin; o sample não inclui token de API)* |

O sample data **não** cria token Bearer. Para rotas autenticadas por API key, gere um token no Admin e cole em `bearer_token`.

Para login por cookie, cadastre um operador no Admin e preencha `email` / `password` no ambiente.

IDs (`user_id`, `order_id`, `file_id`, etc.) devem ser ajustados com valores retornados pelas respostas.

## Fluxo sugerido

1. **0. Health → GET Health**
2. **Relations (validação)** — testa `include` / `patients` / FKs (preencha `user_code` e `professional_id` com UUIDs do sample)
3. **2. Items → GET List users / orders / products**
4. Demais pastas de domínio conforme o teste

Fluxo cookie (opcional, para testar sessão):

1. **1. Auth → POST Login (cookie)**
2. **1. Auth → GET Me (cookie)**

Não misture cookie e Bearer na mesma request — a API responde `AUTH_CONFLICT`.

## Pré-requisitos

```bash
cd kunk-api
docker compose up -d
npm run seed:sample   # se o banco estiver vazio (recria o token demo)
```
