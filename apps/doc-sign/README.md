# Doc-sign

App Vite de modelos TipTap + assinatura pública.

## Portas / rotas

| Rota | Função |
|---|---|
| `/termos` | Lista de termos |
| `/termos/:id` | Detalhe do termo |
| `/termos/:id/audit` | Audit log completo |
| `/modelos` | Lista self / with_patient |
| `/modelos/:kind` | Editor TipTap + publish |
| `/assinar/:token` | Assinatura (público) |

Redirect: `/contratos` → `/termos`.
