<!--
Deployment checklist for the NCS platform. This file exists to satisfy
documentation completeness checks performed by the CI workflow.

It is a *minimal*, RLS-only oriented checklist meant to be adapted to
your organisation’s tooling.
-->

# Deploy Checklist (RLS-only)

## 1) Environment Configuration

- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the target environment.
- (Only for migrations/ops) keep `SUPABASE_SERVICE_ROLE_KEY` available **outside** runtime.
- Confirm security flags:
  - `NCS_USE_RLS=1` (mandatory; backend is RLS-only)
  - `NCS_REQUIRE_AUTH=1` (recommended for staging/prod)
  - `NCS_CORS_ORIGIN` set to the correct SPA origin
  - `NCS_COOKIE_SECURE=1` when staging/prod runs on HTTPS

## 2) Database Migration

- Apply schema migrations from `docs/dev/supabase/*.sql` in order.
- Verify that row-level security (RLS) policies are enabled on core tables (e.g. `ncs_processes`).

## 3) Build & Deploy

- Run `npm run build` to generate the static assets.
- Deploy the `dist/` directory and Netlify functions under `netlify/functions/` (e.g. Netlify).

## 4) Smoke & Security Evidence (staging)

- Run `npm run smoke` and `node scripts/smoke_backend.mjs` to ensure basic behaviour.
- Execute the staging RLS proof and generate evidence pack:
  - Runbook: `docs/STAGING_RLS_PROOF.md`
  - Evidence files (DoD): `docs/evidencias/`

> Any failures in section 4 should block promotion to production.
