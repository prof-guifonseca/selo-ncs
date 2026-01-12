# Prova de Isolamento Multi‑Tenant (RLS)

Este documento descreve como executar, em ambiente de staging, uma prova prática de que as políticas de **row‑level security** (RLS) e o isolamento entre empresas/usuários estão funcionando corretamente no backend do Selo NCS.

## Objetivo

Verificar que um usuário autenticado **A** consegue acessar seu próprio processo (`process_id` pertencente ao seu tenant) e não consegue acessar processos pertencentes a outro usuário/empresa **B**. A prova também confirma que as APIs públicas (`/api/health`) permanecem acessíveis e que as chaves de serviço (quando presentes) não burlam a RLS.

## Pacote de evidências (o que você deve gerar)

O *DoD* da diligência pede que você preencha e versiona estes arquivos em `docs/evidencias/`:

- `RLS_PROBE_RESULT.txt` (output do probe, sem segredos)
- `SECURITY_STAGING_CHECKLIST.md` (checklist técnico de staging)
- `E2E_STAGING_RUN.txt` (E2E manual simples)

Para montar os inputs (contas, tokens e IDs), siga: `docs/evidencias/PROBE_SETUP.md`.

## Pré‑requisitos

1. **Ambiente de staging configurado** com `NCS_USE_RLS=1` e `NCS_REQUIRE_AUTH=1`, e com as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` apontando para o banco de staging.
2. **Dois usuários/tenants válidos** (Tenant A e Tenant B), cada um com ao menos um processo (`ncs_processes.id`) associado.
3. **API base do staging** (ex.: `https://selo-ncs-staging.netlify.app/.netlify/functions/api`). Use este valor em `PROBE_API_BASE` (sem barra final extra).

> Nota importante: dependendo do contexto do Netlify (ex.: “production”), o backend pode **não aceitar Bearer** e exigir sessão via cookies.  
> Se você receber 401 ao usar Bearer em staging, use o modo **cookie jar** (`docs/evidencias/PROBE_MANUAL_CURL.md`).

## Como executar

### Opção A (preferida): script `scripts/rls_probe.mjs` (Bearer)

1. Prepare os inputs (criar contas, obter tokens e criar processos) seguindo `docs/evidencias/PROBE_SETUP.md`.
2. Execute o probe (sugestão: variáveis “inline”, para não deixar token exportado no shell):
   ```bash
PROBE_API_BASE="https://<staging>/.netlify/functions/api" \
PROBE_TENANT_A_TOKEN="$TOKEN_A" \
PROBE_TENANT_A_PROCESS_ID="$PROC_A" \
PROBE_TENANT_B_TOKEN="$TOKEN_B" \
PROBE_TENANT_B_PROCESS_ID="$PROC_B" \
node scripts/rls_probe.mjs
```
3. Cole o output (somente o output do probe, **sem comandos com segredos**) em `docs/evidencias/RLS_PROBE_RESULT.txt`.

### Opção B (fallback): modo manual (cookie jar)

Siga `docs/evidencias/PROBE_MANUAL_CURL.md` e registre o output no mesmo `RLS_PROBE_RESULT.txt`.

## Interpretação do resultado

- **PASS** — indica que a política de acesso está correta para o caso testado (ex.: usuário lê apenas seu próprio processo).
- **FAIL** — indica que o status retornado não atende às expectativas de isolamento. Revise a configuração do Supabase e das políticas RLS.

## Segurança e boas práticas

- Nunca compartilhe JWTs/cookies/keys em logs ou documentação. Siga `docs/evidencias/REDACTION_POLICY.md`.
- Execute esta prova apenas em staging ou ambientes de teste. Em produção, a criação de usuários de teste e a exposição de IDs de processos podem poluir dados reais.

---

Ao seguir este guia você terá evidência concreta de que o modo RLS está ativo e que o backend do Selo NCS respeita o isolamento multi‑tenant. Esse teste é essencial antes de promover uma nova versão para produção.
