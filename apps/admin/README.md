# apps/admin

Painel de **administração da instância** — React + Vite + JavaScript.

## Subir local (sem Docker)

1. API em `http://localhost:8056` (`cd kunk-api && npm run dev`). Com Docker da API, use `:4250` e `VITE_API_PROXY_TARGET=http://localhost:4250`.
2. Na raiz: `npm install`
3. `npm run dev:admin` → [http://localhost:4256](http://localhost:4256)

## Login admin

| Fonte | E-mail | Senha |
|---|---|---|
| Testes / E2E | `admin@kunk-api.test` | `TestAdmin123!` |
| Sample seed | `admin@demo.kunk.local` | `DemoAdmin123!` |

Ambos com role **`Administrador`**.

Garantir usuário de teste (com API/DB no ar):

```bash
cd kunk-api && node -e "require('./tests/helpers/db').ensureAdminUser().then(console.log).then(()=>process.exit(0))"
```

## Docker

Standalone (API no host):

```bash
npm run docker:admin
```

Stack API + admin:

```bash
npm run docker:kunk
```

## Rotas

| Rota | Área |
|---|---|
| `/login` | Login operador |
| `/dados` | Browser de collections |
| `/arquivos` | Files |
| `/configs` | system_configs |
| `/usuarios` | system_users + roles |

Sessão: cookie HttpOnly `kunk_oss_session` (distinto do Kunk legado).
