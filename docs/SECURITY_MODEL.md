# Modelo de Segurança (RLS obrigatório)

**Data:** 2026-01-04

Este repositório foi desenhado para operar com **cookies HttpOnly** e **multi‑tenant**.  
Historicamente havia duas abordagens para o isolamento de dados: implementar o hard gate na camada de aplicação ou delegá‑lo ao banco de dados via **Row Level Security (RLS)**.
Na versão atual, a implementação via código (modo “baseline”) foi descontinuada; todas as políticas de acesso residem exclusivamente no banco via RLS.

## Princípios não negociáveis

1) **Sessão cookie-first**
- Access/refresh em cookies HttpOnly (`ncs_at`, `ncs_rt`).
- O front envia `credentials: 'include'`.
- O front não deve persistir tokens.

2) **Multi‑tenant**
- O usuário só vê dados do(s) `company_id` associado(s) via `ncs_memberships`.
- Quando RLS está ligado, isso é reforçado por políticas do Postgres.

3) **View-only para evidências**
- Upload e view são via URLs assinadas (curta duração).
- O sistema evita “download público” e evita servir arquivos pelo Netlify.

## RLS obrigatório

O backend opera sempre com **Row Level Security (RLS)** ativada.  Não existe mais um “modo baseline” ou opção para executar sem RLS.  Toda tentativa de desativar RLS via a variável de ambiente `NCS_USE_RLS` (por exemplo, definindo `0`, `false` ou `no`) resulta em um erro de misconfiguração e a API retorna um status `503`.  A chave anônima do Supabase (`SUPABASE_ANON_KEY`) é necessária para autenticar as requisições e o JWT do usuário é usado para todas as operações de dados.  A chave de service role (`SUPABASE_SERVICE_ROLE_KEY`) é utilizada apenas em operações administrativas específicas (como geração de URLs assinadas), nunca para leituras multi‑tenant.

Esta mudança fortalece o isolamento entre empresas e elimina a classe inteira de bugs em que a aplicação era responsável por validar o tenant manualmente.  A lógica de permissões vive agora inteiramente nas políticas de banco de dados (RLS), e o código do backend delega a filtragem ao banco.

## Gates (comportamento esperado)

- `NCS_REQUIRE_AUTH=1`:
  - rotas protegidas → `401` sem cookie/sessão válida.
- Falta de env crítica (URL/keys):
  - backend deve falhar com `503` (fail-closed).

> O smoke do backend (`scripts/smoke_backend.mjs`) cobre esses gates.

## Onde ficam as políticas (RLS)

- Pipeline SQL: `docs/dev/supabase/*.sql`
- Policies: `docs/dev/supabase/20_security.sql`

Recomendação operacional: ligar RLS primeiro em **staging** com:
- `NCS_USE_RLS=1`
- `NCS_REQUIRE_AUTH=1`

e só então promover.

## Auditoria (mínimo defensável)

O repo já tem `ncs_audit_log` no schema. A robustez “de verdade” vem de:
- registrar eventos essenciais (publish, decisão, mudanças críticas)
- manter trilha por tenant + user_id + process_id

As recomendações detalhadas de robustez e auditoria foram incorporadas em `docs/DIAGNOSTIC.md`. Consulte-o para critérios de Done e próximos passos.
