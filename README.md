# Selo NCS — Governança & Impacto (repo “selo-ncs-main”)

**Status do MVP (foto real): 08.01.2026**  
**Stack:** SPA Vanilla JS (ESM) + Netlify Functions (Node) + Supabase (Postgres + Storage)  
**Princípio dominante:** *static-first* (build determinístico → `/dist`) + backend como **Fonte de Verdade**.

---

## O que existe e funciona hoje (MVP real)

### Produto (front)
- **SPA com History API** (roteamento por path e query string) com shell em `index.html` e roteador em `src/router.js`.
- Views são **partials** em `/partials` (injetadas no build) com ações via *event delegation* (`data-action`) em `src/actions.js`.
- **3 painéis por papel**:
  - Participante: `partials/client-dashboard.html` + `src/dashboards/client.js`
  - Avaliador: `partials/auditor-dashboard.html` + `src/dashboards/auditor.js`
  - Gestor (admin): `partials/admin-dashboard.html` + `src/dashboards/admin/*`
- Geração de **entregáveis em HTML** (ex.: sumário executivo / plano de ação / certificado) via `src/report.js` e `src/deliverables.js`.

### Backend (Netlify Functions)
- Função principal **`api`** (`/.netlify/functions/api`) com roteador em `netlify/functions/api/index.js`.
- Módulos de rotas (contrato real em `docs/API.md`):
  - `health`, `auth`/`session`, `app-state`
  - `companies`, `memberships`, `assignments`
  - `processes`, `evidences`, `audit-log`
  - `public-pages` + extras de `preview/publish`
- Funções dedicadas fora do roteador:
  - `/.netlify/functions/report` (via `/api/report`) — preview de relatório (HTML/JSON) para impressão rápida
  - `/.netlify/functions/chat` (via `/api/chat`) — assistente opcional (feature flag)
  - `/.netlify/functions/telemetry` (via `/api/telemetry`) — **ACK** de telemetria (não persiste; protótipo)

### Dados (Supabase)
- Modelo multi-tenant baseado em `ncs_companies` + `ncs_memberships` (papéis: `client`, `auditor`, `admin`).
- Núcleo do fluxo: `ncs_processes`, `ncs_evidences`, `ncs_public_pages`, `ncs_audit_log`.
- Schema e políticas: `docs/dev/supabase/*` (ver `docs/dev/SUPABASE_SETUP.md`).

---

## Segurança: cookie-first + RLS obrigatório (mudança importante)

Este repo opera com:
- **Sessão por cookies HttpOnly** (`ncs_at`, `ncs_rt`). O front sempre usa `credentials: "include"`.
- **Row Level Security (RLS) obrigatório** no Supabase.

O **modo “baseline” foi removido**.  
`NCS_USE_RLS` deixou de ser “toggle” e virou **guarda de misconfig**:
- `NCS_USE_RLS` em `1` (ou **omitido**) → ok
- `NCS_USE_RLS` em `0/false/no` → backend responde **503** com erro `MISCONFIG_RLS_DISABLED`


Referências:
- `docs/DECISIONS.md` (2026-01-04 — RLS obrigatório)
- `docs/SECURITY_MODEL.md`
- `docs/STAGING_RLS_PROOF.md` + `scripts/rls_probe.mjs`

---

## Como rodar (local)

### Pré-requisitos
- Node 18+ (o CI usa Node moderno; este repo roda bem com Node 20+)
- (Opcional) Python para servir o `/dist`

### Build do front
```bash
npm ci
node build.js
