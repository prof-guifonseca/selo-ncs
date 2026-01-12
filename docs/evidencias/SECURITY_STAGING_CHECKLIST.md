# Security — Staging Checklist (RLS-only)

**Data/Hora:** 2026-01-08 18:19:22 -03 (-0300)

**Staging URL (site):** https://selo-ncs-staging.netlify.app

**API base (PROBE_API_BASE):** https://selo-ncs-staging.netlify.app/.netlify/functions/api

**Snapshot:** ZIP sha256: 890c8746ef432a197d908b1ebddd227af6e04443c240e71edf82f3497bb87474

> **Nota de sigilo:** este checklist não deve conter tokens, JWTs completos, service role keys nem secrets.

---

## 1) Gates mínimos (Netlify env)

Marque ✅ **apenas** quando conferido diretamente em *Netlify → Site configuration → Environment variables* (ou via `netlify env:list`, se usar CLI).

- [ ] `NCS_USE_RLS=1` (RLS-only obrigatório; `0` deve falhar com 503/MISCONFIG)
- [ ] `NCS_REQUIRE_AUTH=1` (rotas sensíveis exigem sessão)
- [ ] `NCS_CORS_ORIGIN` correto e **sem barra final** (ex.: `https://SEU_DOMINIO.netlify.app`)
- [ ] `NCS_COOKIE_SAMESITE` coerente com a topologia:
  - mesma origem SPA+API → `Lax` (ok)
  - origens diferentes → `None` (exige HTTPS)
- [ ] `NCS_COOKIE_SECURE=1` (**se HTTPS**) — cookies Secure devem estar ativos em staging com TLS
- [ ] `SUPABASE_URL` aponta para o projeto **staging**
- [ ] `SUPABASE_ANON_KEY` (staging) configurada
- [ ] (opcional) `SUPABASE_SERVICE_ROLE_KEY` **não é necessária** para fluxo RLS, mas se existir deve ser tratada como segredo e não usada para bypass

**Evidência/observação:**
- Fonte: `.env.example` e `netlify/functions/api/core.js` (guards) / `netlify/functions/api/auth.js` (RLS-only).

---

## 2) Storage de evidências (Supabase)

Diligência Técnica — **08.01.26**

- [ ] Bucket de evidências existe (padrão esperado no código: `ncs-evidences`, ou `SUPABASE_BUCKET`)
- [ ] Bucket marcado como **private** (não public)
- [ ] Políticas de Storage/objetos garantem **need-to-know** (acesso apenas por usuários autorizados)
- [ ] Não existe URL pública direta para download (sempre via autorização / URL assinada quando aplicável)

**Como verificar (rápido):**
- Supabase → Storage → Buckets → (verificar coluna **Public**)
- (se aplicável) revisar policies em `storage.objects` no SQL do projeto.

**Evidência/observação:**
- Link para prints internos (não incluir aqui, apenas referenciar): ___________________

---

## 3) JWT / Sessão / Integração Supabase

Diligência Técnica — **08.01.26**

- [ ] Tokens de usuário emitidos pelo Supabase validam corretamente no backend (sem 401 inesperado)
- [ ] Secrets/JWT settings do projeto staging não foram rotacionados sem atualizar consumidores
- [ ] **Consistência Supabase ↔ Netlify:** `SUPABASE_URL`/keys correspondem ao mesmo projeto de autenticação usado pelos usuários do staging

> Nota técnica: neste repo, o backend valida JWT chamando `GET /auth/v1/user` no Supabase (não há verificação local por segredo JWT), então o ponto crítico aqui é **apontar para o projeto certo** e manter as keys corretas.

**Evidência/observação:** ___________________

---

## 4) CSP / Headers de segurança

Diligência Técnica — **08.01.26**

- [ ] CSP revisada e compatível com o MVP (mínimo necessário)
- [ ] `Strict-Transport-Security` habilitado em staging com HTTPS
- [ ] `X-Frame-Options=DENY` / `frame-ancestors 'none'`

**CSP atual (netlify.toml):**
```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; upgrade-insecure-requests
```

**Observações:**
- Se/Quando possível, substituir `script-src 'unsafe-inline'` por hashes/nonces (reduz risco de XSS).
- Se a SPA precisar falar com Supabase direto do browser, ajuste `connect-src` para incluir o domínio do projeto Supabase.

---

## 5) Prova de isolamento (RLS Probe)

- [ ] `docs/evidencias/RLS_PROBE_RESULT.txt` gerado **em staging** com tokens de 2 tenants reais
- [ ] Resultado **PASS** em `same-tenant-A`, `same-tenant-B` e **PASS** (bloqueio) em `cross-tenant-*`

**Arquivo de evidência:** `docs/evidencias/RLS_PROBE_RESULT.txt`

---

## 6) E2E manual (staging)

Diligência Técnica — **08.01.26**

- [ ] `docs/evidencias/E2E_STAGING_RUN.txt` preenchido com passos + resultados + fricções

---

## 7) Assinatura (responsável)

- Executor: ___________________
- Revisão (2º par): ___________________
- Data: ___________________
