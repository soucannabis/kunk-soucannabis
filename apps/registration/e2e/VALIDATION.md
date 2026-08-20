# Validação escrita — E2E Playwright (cadastramento)

Documentação de cada teste automatizado do funil em `apps/registration/e2e/`.  
Última execução de referência: **19 passed**, **1 skipped** (`npx playwright test`).

| Ambiente | Valor |
|---|---|
| Front | `http://localhost:4255` |
| API | `http://localhost:4250/api/v1` |
| Cookie de sessão | `associate_session` (HttpOnly) |
| E-mails | gerados por `uniqueEmail(prefix)` → `{prefix}-{timestamp}-{rand}@test.local` |

### Payloads canônicos (`helpers/fixtures.js`)

**Responsável** (`responsiblePayload`):

| Campo | Valor |
|---|---|
| `responsible_type` | `himself` (ou override) |
| `associate_name` / `associate_last_name` | Ana / Silva |
| `associate_birth_date` | `1990-01-15` |
| `gender` | `mulher-cis` |
| `nationality` | Brasileira |
| `associate_cpf` | `52998224725` |
| `associate_rg` / issuer | `1234567` / `SSP/SP` |
| `marital_status` | Solteiro(a) |
| `account_password` | definida no `register-email` (`senha123`, min. 8) |
| `mobile_number` | `5511999999999` |
| endereço | Rua A, 100, Centro, São Paulo/SP, CEP `01310100` |
| `ciap_codes` | `A01`, `P01` |
| `reason_treatment_text` | Dor crônica |

**Paciente** (`patientPayload`):

| Campo | Valor |
|---|---|
| nome | João Souza |
| nascimento | `2010-05-01` |
| `gender` | `homem-cis` |
| CPF / RG | mesmo CPF válido / `7654321` |
| `ciap_codes` | `N01` |
| motivo | Cefaleia |

### Seed via API (`seedAssociate`)

Usado quando o teste não precisa repetir o funil inteiro na UI. Cookie compartilhado com o browser via `page.context().request`.

| `phase` | O que a API faz |
|---:|---|
| 1 | `POST /auth/associate/register-email` → **201**, `associate_status=1` |
| 2 | + `PATCH /users/me` com payload completo → **200** |
| 3 | + paciente se `another`; `POST /users/me/advance` até status **3** |
| 4 | + upload CNH (`POST /files`); `advance` → status **4** |
| 5 | + `UPDATE users SET associate_status=5` (helper DB QA) |

---

## 1. Auth — `auth.spec.js`

### 1.1 `register email → bem-vindo`

| | |
|---|---|
| **Objetivo** | Conta nova por e-mail abre a fase 1 na UI |
| **Entrada (UI)** | `GET /cadastro` → e-mail único + senha + confirmação → botão “Se cadastrar como Associado” |
| **API implícita** | `POST /auth/associate/register-email` `{ email, password }` |
| **Retorno esperado** | **201**; cookie `associate_session`; user com `associate_status=1` |
| **Validação UI** | URL `/bem-vindo`; heading “Bem-vindo”; texto com o e-mail cadastrado |
| **Critério de aceite** | Sessão criada e hidratação do e-mail na tela de boas-vindas |

### 1.2 `register duplicate shows error and login link path`

| | |
|---|---|
| **Objetivo** | E-mail já em andamento não cria segunda conta |
| **Pré-condição** | `seedAssociate(phase: 1)` no mesmo e-mail |
| **Entrada (UI)** | Novo submit em `/cadastro` com o mesmo e-mail |
| **API implícita** | `POST /auth/associate/register-email` → **409** `ACCOUNT_IN_PROGRESS` (ou `ACCOUNT_EXISTS`) |
| **Validação UI** | `role=alert` contém texto `/andamento\|login\|existe/i` |
| **Critério de aceite** | Erro amigável; usuário orientado a login |

### 1.3 `login with password after form save`

| | |
|---|---|
| **Objetivo** | Login com senha após dados salvos |
| **Pré-condição** | Seed fase 2 (register + `PATCH /users/me` com senha `senha123`); depois `logout` |
| **Entrada (UI)** | `/login` → e-mail + `senha123` → “Entrar” |
| **API implícita** | `POST /auth/associate/login` → **200** + cookie |
| **Validação UI** | URL deixa `/login`; botão “Sair” visível |
| **Critério de aceite** | Sessão restaurada após logout |

### 1.4 `nova-senha forgot flow shows generic success`

| | |
|---|---|
| **Objetivo** | Forgot password não revela se o e-mail existe |
| **Entrada (UI)** | `/nova-senha` → e-mail aleatório → “Enviar link” |
| **API implícita** | `POST /auth/associate/forgot-password` → **200** genérico |
| **Validação UI** | Mensagem “Se o e-mail existir…” |
| **Critério de aceite** | Resposta sempre genérica (sem enumeração de contas) |

### 1.5 `nova-senha reset with API token` *(skipped se API sem `NODE_ENV=test`)*

| | |
|---|---|
| **Objetivo** | Redefinir senha com token |
| **Pré-condição** | Seed fase 2; logout; `forgotPassword` retorna `data.reset_token` (só em test) |
| **Entrada (UI)** | Token + nova senha `novaSenha99` → “Redefinir” |
| **API** | `POST /auth/associate/reset-password` `{ token, password }` → **200** |
| **Validação UI** | “Senha atualizada” |
| **Nota** | Skip esperado em API com `NODE_ENV=development` (token não exposto no JSON) |

### 1.6 `logout clears session`

| | |
|---|---|
| **Objetivo** | Logout invalida acesso autenticado |
| **Pré-condição** | Seed fase 1; visita `/bem-vindo` |
| **Entrada (UI)** | “Sair”; depois `goto /bem-vindo` |
| **API implícita** | `POST /auth/associate/logout` |
| **Validação UI** | Redirect para `/login` |
| **Critério de aceite** | Rotas autenticadas exigem cookie válido |

---

## 2. Funil de formulários — `funnel-forms.spec.js`

### 2.1 `bem-vindo → form → documentos (himself)`

| | |
|---|---|
| **Objetivo** | Happy path responsável “para mim” até documentos |
| **Pré-condição** | Seed fase 1 |
| **Entrada (UI)** | “Iniciar cadastro” → form completo (`responsiblePayload`) → “Salvar e continuar” |
| **API** | `PATCH /users/me` **200** (`meta.saved_fields`, `invalid_fields=[]`); `POST /users/me/advance` → fase **3** |
| **Validação UI** | URL `/documentos`; heading “Documentos de identidade” |
| **Critério de aceite** | Form válido avança o funil sem paciente |

### 2.2 `partial save keeps valid fields and shows invalid`

| | |
|---|---|
| **Objetivo** | Persistência parcial + `invalid_fields` |
| **Entrada (UI)** | Nome=`Ana` (válido); CPF=`000` (inválido) → salvar |
| **API** | `PATCH /users/me` **200**; `meta.saved_fields` inclui `associate_name`; `invalid_fields` inclui `associate_cpf` (e demais obrigatórios vazios) |
| **Validação UI** | Alert visível; permanece em `/cadastro-associado`; após reload, Nome ainda = `Ana` |
| **Critério de aceite** | Server é fonte de verdade; válidos persistem, inválidos não bloqueiam o 200 |

### 2.3 `another → paciente → documentos`

| | |
|---|---|
| **Objetivo** | Fluxo responsável por outra pessoa |
| **Entrada (UI)** | Form responsável com `responsible_type=another` → `/cadastro-paciente` → `patientPayload` → salvar |
| **API** | `PATCH /users/me`; `POST /users/me/patients` **201** (`status=patient`); `POST /users/me/advance` **200** → fase 3 |
| **Validação** | URL paciente; campo Nome = `João`; response `advance` OK; URL `/documentos` |
| **Critério de aceite** | Paciente obrigatório antes de docs quando `another` |

---

## 3. Documentos — `documents.spec.js`

### 3.1 `CNH upload completes and advances to terms stub`

| | |
|---|---|
| **Objetivo** | CNH (aberta) completa identidade e vai à fase 4 |
| **Pré-condição** | Seed fase 3 |
| **Entrada (UI)** | Modo CNH; upload `#responsible-front` (JPEG mínimo); “Avançar para assinatura” |
| **API** | `POST /files` multipart (`doc_type=cnh`, `side=front`, `subject=responsible`, `doc_kind=identity`) **201**; `GET /users/me/documents/status` → `complete=true`, `mode=cnh`; `POST /users/me/advance` → fase **4** |
| **Validação UI** | “Documentos OK”; heading Assinatura; botão Assinar termo |

### Phase4 — assinatura disponível

| Item | Valor |
|---|---|
| **Pré-condição** | Seed fase 4 (+ templates doc-sign publicados) |
| **API relacionada** | `POST /doc-sign/contracts` |
| **Validação UI** | Heading “Assinatura do termo”; botão “Assinar termo” (sem stub) |
| **Critério de aceite** | Completude CNH = 1 arquivo frente |

### 3.2 `RG requires front and back`

| | |
|---|---|
| **Objetivo** | RG incompleto não libera avanço |
| **Entrada (UI)** | Modo RG; upload só frente → sem botão avançar; depois verso |
| **API** | Dois `POST /files` (`side=front` e `back`); status parcial → completo `mode=rg` |
| **Validação UI** | Sem “Avançar…” após só frente; “Documentos OK (rg)” + botão após verso |
| **Critério de aceite** | Regra RG = frente + verso |

### 3.3 `another requires patient docs too`

| | |
|---|---|
| **Objetivo** | Com `another`, docs do paciente também são obrigatórios |
| **Pré-condição** | Seed fase 3 + `responsibleType=another` (paciente já criado via API) |
| **Entrada (UI)** | CNH responsável → ainda sem avançar; CNH `#patient-front` |
| **API** | Uploads `subject=responsible` e `subject=patient`; `documents/status.complete=true` só com ambos |
| **Validação UI** | Botão “Avançar para assinatura” só após paciente |
| **Critério de aceite** | Completude por subject |

### 3.4 `phase 4 shows signing CTA (not stub)`

| | |
|---|---|
| **Objetivo** | Fase 4 oferece CTA de assinatura no doc-sign |
| **Pré-condição** | Seed fase 4 (+ templates publicados) |
| **Entrada (UI)** | `GET /documentos` |
| **API relacionada** | `POST /doc-sign/contracts` |
| **Validação UI** | Heading “Assinatura do termo”; botão “Assinar termo” |
| **Critério de aceite** | Sem mensagem de módulo em desenvolvimento |

---

## 4. Fase 5 — `phase5.spec.js`

### 4.1 `consulta → concluir → cadastro-concluido`

| | |
|---|---|
| **Objetivo** | Finalizar cadastro na fase 5 |
| **Pré-condição** | Seed fase 5 (`associate_status=5` via DB QA); assert `user.associate_status === 5` |
| **Entrada (UI)** | `/consulta`; textarea receita = `Receita de teste E2E`; “Concluir cadastro” |
| **API** | `PATCH /users/me` `{ prescription }` **200** (campos fase 5 liberados); `POST /users/me/complete` → `status=Associado` |
| **Validação UI** | URL `/cadastro-concluido`; textos “Cadastro concluído” e “Associado” |
| **Critério de aceite** | Encerramento do responsável com status string `Associado` |

### 4.2 `home redirects Associado to concluido`

| | |
|---|---|
| **Objetivo** | Router `/` respeita conclusão |
| **Pré-condição** | Seed fase 5 + `POST /users/me/complete` via API |
| **Entrada (UI)** | `goto /` |
| **Validação UI** | Redirect `/cadastro-concluido` |
| **Critério de aceite** | Associado concluído não reabre o funil |

---

## 5. Guards — `guards.spec.js`

### 5.1 `phase 1 cannot open documentos`

| | |
|---|---|
| **Pré-condição** | Fase 1 |
| **Ação** | `goto /documentos` |
| **Validação** | URL **não** fica em `/documentos`; cai em bem-vindo / form / login |
| **Aceite** | Guard de fase no router |

### 5.2 `phase 3 cannot open cadastro-associado`

| | |
|---|---|
| **Pré-condição** | Fase 3 |
| **Ação** | `goto /cadastro-associado` |
| **Validação** | Redirect `/documentos` |
| **Aceite** | Não voltar a etapas anteriores |

### 5.3 `phase 4 stays on documentos not consulta`

| | |
|---|---|
| **Pré-condição** | Fase 4 |
| **Ação** | `goto /consulta` |
| **Validação** | Não fica em `/consulta`; heading de assinatura do termo |
| **Aceite** | Fase 5 inacessível sem termo assinado / bypass |

### 5.4 `unauthenticated / redirects to login`

| | |
|---|---|
| **Ação** | `goto /` sem cookie |
| **Validação** | `/login` |
| **Aceite** | Rotas autenticadas protegidas |

### 5.5 `root redirects by phase`

| | |
|---|---|
| **Pré-condição** | Fase 3 |
| **Ação** | `goto /` |
| **Validação** | `/documentos` |
| **Aceite** | Home = rota da fase atual |

---

## Matriz resumo

| # | Spec | Teste | Resultado esperado |
|---:|---|---|---|
| 1 | auth | register → bem-vindo | 201 + `/bem-vindo` |
| 2 | auth | e-mail duplicado | 409 + alert |
| 3 | auth | login | 200 + sessão |
| 4 | auth | forgot genérico | 200 + mensagem |
| 5 | auth | reset token | 200 ou **skip** |
| 6 | auth | logout | redirect login |
| 7 | forms | himself → docs | advance → fase 3 |
| 8 | forms | parcial | 200 + nome persistido |
| 9 | forms | another + paciente | advance → docs |
| 10 | docs | CNH → fase 4 | Assinar termo |
| 11 | docs | RG frente+verso | completo |
| 12 | docs | another + patient docs | completo |
| 13 | docs | fase 4 | CTA Assinar termo |
| 14 | fase5 | concluir | `status=Associado` |
| 15 | fase5 | `/` Associado | `/cadastro-concluido` |
| 16–20 | guards | fases / auth | redirects corretos |

---

## Como revalidar

```bash
# API :4250 + (opcional) front :4255
cd apps/registration
npx playwright test
npx playwright show-report
```

Este arquivo descreve o **contrato de validação** dos E2E; a fonte executável continua sendo os `*.spec.js`.
