# Admin — Validação E2E (Playwright)

Última estrutura alinhada aos specs em `e2e/`.

| Ambiente | Valor |
|---|---|
| Front | `http://localhost:4256` |
| API | `http://localhost:4250/api/v1` (via proxy `/api/v1`) |
| Cookie | `kunk_oss_session_admin` |
| Admin | `admin@kunk-api.test` / `TestAdmin123!` |
| Não-admin | `acolhimento@kunk-api.test` / `TestAcol123!` |

## Specs

### 1. Auth — `auth.spec.js`

| # | Teste | Critério |
|---|---|---|
| 1.1 | login Administrador | URL `/dados`, shell visível |
| 1.2 | credencial inválida | alert + permanece em `/login` |
| 1.3 | logout | volta a `/login` |

### 2. Guards — `guards.spec.js`

| # | Teste | Critério |
|---|---|---|
| 2.1 | Acolhimento | `/sem-permissao` |

### 3. Usuários — `users.spec.js`

| # | Teste | Critério |
|---|---|---|
| 3.1 | criar/editar/desativar | formulário salva e status inactive |

### 4. Configs — `configs.spec.js`

| # | Teste | Critério |
|---|---|---|
| 4.1 | systems + edit/clear | salva e limpa key registration |

### 5. Dados — `data.spec.js`

| # | Teste | Critério |
|---|---|---|
| 5.1 | CRUD etiquetas | criar, editar, excluir |

### 6. Serviços externos — `external-services.spec.js`

| # | Teste | Critério |
|---|---|---|
| 6.1 | secret Loggi | falha de teste não persiste |

### 7. Páginas novas (smoke)

| Spec | Critério |
|---|---|
| `storage.spec.js` | `/armazenamento` mostra driver |
| `cache.spec.js` | limpar cache |
| `system-errors.spec.js` | heading erros |
| `web-vitals.spec.js` | heading Web Vitals |
| `appearance.spec.js` | aparência Kunk |
| `files.spec.js` | listagem arquivos |
| `role-pages.spec.js` | permissões de acesso |
| `triage.spec.js` | form/status/módulos |
| `ciap2.spec.js` | módulo CIAP-2 |
| `services-types.spec.js` | tipos profissional |

## Como revalidar

```bash
# API :4250 no ar
cd kunk-api && npm run dev

# na raiz
npm run test:e2e:admin
npm run test:e2e:admin:ui

# ou em apps/admin
cd apps/admin
npm run test:e2e
npm run test:e2e:ui
```

Navegações usam `appUrl()` (`http://localhost:4256/...`) para não depender só do `baseURL` do Playwright.
