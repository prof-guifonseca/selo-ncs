# Segurança (operacional) — referência para quem mexe no backend

**Data:** 2026-01-04

Este arquivo existe porque o código referencia `docs/dev/SECURITY_MODEL.md`.

## Checklist rápido para staging seguro

1) Defina envs:
- `NCS_USE_RLS=1`
- `NCS_REQUIRE_AUTH=1`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_BUCKET`

2) Rode SQL (ordem):
- `docs/dev/supabase/10_schema.sql`
- `docs/dev/supabase/20_security.sql`
- `docs/dev/supabase/30_rpc.sql` (se aplicável)
- `docs/dev/supabase/40_storage.sql`
- `docs/dev/supabase/50_seed.sql` (somente se quiser seed)

3) Smoke:
- `node scripts/smoke_backend.mjs`
- `npm run build && npm run smoke`

## Onde o backend deve evitar service role quando RLS está ON

- Operações de dados (REST):
  - usar `restGet/restPost/restPatch/restDelete` com JWT do usuário (`supabase.js`)
- Assinaturas de Storage:
  - `createSignedUploadUrl` e `createSignedDownloadUrl` usam JWT quando RLS está ON (ver `supabase.js`)

## Quando o service role ainda faz sentido (mesmo com RLS)

Somente quando:
- a ação precisa **burlar** RLS por desenho (ex.: operação de manutenção),
- e isso estiver **comentado e justificado** no código.

Regra de ouro: *“service role é o último recurso, não o default.”*
