# Segurança

## Como reportar

Se encontrar uma vulnerabilidade no Kunk (API, apps ou pacotes deste monorepo):

1. Abra um **GitHub Security Advisory** privado em [soucannabis/kunksoucannabis-open](https://github.com/soucannabis/kunksoucannabis-open/security/advisories), ou
2. Abra uma issue marcada como segurança **sem** publicar detalhes exploráveis em público.

Não use issues públicas para PoCs de exploração ou dados sensíveis.

## Escopo

Inclui:

- Falhas de autenticação/autorização na API ou nos apps
- Exposição indevida de dados ou secrets
- Problemas de validação/sanitização exploráveis no Kunk

Fora do escopo (sem PoC no Kunk):

- Vulnerabilidades genéricas em dependências de terceiros
- Problemas só em configurações de deploy do operador (sem falha no código)
- Relatórios sem impacto demonstrável neste projeto

## Resposta

Tentamos acusar recebimento em até **7 dias úteis** e informar o andamento quando houver correção ou mitigação planejada.

## Versões suportadas

Corrigimos vulnerabilidades na branch principal de desenvolvimento (`dev` / `main` do monorepo OSS). Releases pontuais dependem do ciclo de publicação do projeto.
