# Evidências de Segurança — Staging (RLS-only)

Esta pasta concentra **tudo o que você precisa** para executar e registrar evidências auditáveis em *staging* antes do go-live.

> **Regra de ouro (sigilo):** nunca commitar/colar aqui **tokens**, **JWTs completos**, **service role keys**, **secrets**, nem dumps de headers. Use apenas **IDs** (UUIDs), e‑mails e observações.

## Arquivos “DoD” (saídas finais)

- `RLS_PROBE_RESULT.txt` — saída do probe de isolamento (script ou modo manual), **sem tokens**.
- `SECURITY_STAGING_CHECKLIST.md` — checklist técnico de staging (Netlify env + Supabase + CSP).
- `E2E_STAGING_RUN.txt` — execução manual E2E (passo a passo + resultados + fricções).

## Documentos de apoio (para o teste acontecer)

- `PROBE_SETUP.md` — passo a passo completo: preparar contas, obter tokens com segurança, criar processos e rodar o probe.
- `PROBE_INPUTS.md` — ficha de **inputs não sensíveis** (e‑mails, IDs de processos) para você preencher.
- `PROBE_MANUAL_CURL.md` — alternativa ao script quando *Bearer token* não é aceito no ambiente (contexto “production”).
- `REDACTION_POLICY.md` — regras simples de sanitização para terminal/logs.
- `TROUBLESHOOTING.md` — causas comuns de 401/403/404/503 e como destravar.

## Fluxo recomendado (10–20 min)

1) **Precheck rápido**
- Preencha a seção 1–4 do `SECURITY_STAGING_CHECKLIST.md` (env vars + storage + JWT + CSP).

2) **Preparar dados de teste**
- Siga `PROBE_SETUP.md` para criar **Tenant A** e **Tenant B** (usuários distintos) e gerar **um processo** para cada.
- Preencha `PROBE_INPUTS.md` com e‑mails e IDs (sem tokens).

3) **Executar o probe**
- Preferencial: `node scripts/rls_probe.mjs` (modo Bearer) e cole a saída em `RLS_PROBE_RESULT.txt`.
- Alternativa: `PROBE_MANUAL_CURL.md` (modo cookie jar), se o ambiente bloquear Bearer.

4) **E2E manual**
- Complete `E2E_STAGING_RUN.txt` com o resultado.

5) **Assinatura e revisão**
- Assine/complete a seção 7 do checklist (executor + 2º par).

## Referência

- Runbook principal: `docs/STAGING_RLS_PROOF.md`
