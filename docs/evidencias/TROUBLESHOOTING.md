# TROUBLESHOOTING — Destravando o RLS Probe em staging

## 1) O script aborta: “Variáveis obrigatórias não definidas”

Causa:
- Você rodou `node scripts/rls_probe.mjs` sem definir:
  - `PROBE_API_BASE`
  - `PROBE_TENANT_A_TOKEN`
  - `PROBE_TENANT_A_PROCESS_ID`
  - `PROBE_TENANT_B_TOKEN`
  - `PROBE_TENANT_B_PROCESS_ID`

Correção:
- Siga `PROBE_SETUP.md` (seções 3–5) e rode o probe com variáveis “inline”.

---

## 2) 503 / MISCONFIG / RLS disabled

Sintoma:
- `503` com erro tipo `MISCONFIG_RLS_DISABLED` ou mensagem indicando RLS desabilitado.

Causa comum:
- `NCS_USE_RLS=0` (ou vazio) no Netlify env.

Correção:
- No Netlify (staging): confirme `NCS_USE_RLS=1`.
- Veja `SECURITY_STAGING_CHECKLIST.md` (seção 1).

---

## 3) 503 / CONFIG / SUPABASE_ANON_KEY é obrigatória

Sintoma:
- `503` com erro `CONFIG` mencionando `SUPABASE_ANON_KEY`.

Causa:
- `SUPABASE_ANON_KEY` ausente no ambiente (staging).

Correção:
- Configure no Netlify env vars e redeploy.

---

## 4) 401 / AUTH_REQUIRED mesmo com Bearer

Sintoma:
- Requests com `Authorization: Bearer ...` retornam 401 em staging.

Possíveis causas:

### 4.1) Bearer está bloqueado (Netlify contexto “production”)
O backend aceita Bearer em contextos não‑prod. Em “production”, ele tende a aceitar **somente cookies**.

Como confirmar:
- Faça `/api/auth/me` com Bearer → 401
- Faça login via `/api/auth/login` e repita `/api/auth/me` com cookie jar → 200

Correção:
- Use `PROBE_MANUAL_CURL.md` (cookie jar) **ou** rode o probe em um deploy de branch/preview (não-prod).

### 4.2) Token inválido/expirado
Correção:
- Reobtenha o token via Supabase Auth API (password grant).

---

## 5) 404 ao ler processo “do próprio tenant”

Sintoma:
- Tenant A tenta ler `PROC_A` e recebe 404/401.

Causas comuns:
- `PROC_A` está errado (vazio ou não é `proc_...`)
- O processo foi criado com outro usuário/token
- O processo não foi persistido (POST falhou)

Correção:
- Recrie `PROC_A` com o mesmo token do Tenant A (ver seção 4 do `PROBE_SETUP.md`)
- Confirme status do POST (ideal: 200)
- Refaça o GET do processo

---

## 6) Cross-tenant retorna 200 (isso é grave)

Sintoma:
- Tenant B consegue ler `PROC_A` com 200.

Isso **falha a prova de isolamento**. Possíveis causas:
- Token/cookies trocados (você usou jar/token errado)
- O processo não pertence ao Tenant A (IDs misturados)
- Políticas RLS permissivas demais (SQL/staging desalinhado)

Correção:
- Primeiro elimine erro operacional: refaça o teste com tokens/jars bem separados.
- Se persistir:
  - revise policies de `ncs_processes` (select/update) e o helper `ncs_can_access_process`
  - confirme que RLS está habilitado na tabela (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
  - confirme que você **não** está usando service role em nenhum request (bypass)

---

## 7) Problemas no browser (CORS / cookies)

Sintoma:
- Login “funciona” mas SPA não mantém sessão.

Causas:
- `NCS_CORS_ORIGIN` incorreto
- `NCS_COOKIE_SAMESITE`/`NCS_COOKIE_SECURE` inconsistentes com HTTPS e origens
- Staging em HTTP (cookies Secure não funcionam)

Correção:
- Revise seção 1 do `SECURITY_STAGING_CHECKLIST.md`.
