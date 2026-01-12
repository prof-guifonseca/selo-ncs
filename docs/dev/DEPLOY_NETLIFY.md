# Deploy no Netlify (notas operacionais)

O deploy é *static-first* e barato.

## Build/publish
- Build: `node build.js`
- Publish: `dist`
- Functions: `netlify/functions`

## Rotas
- `/api/*` → `/.netlify/functions/api/:splat`
- `/report`, `/chat`, `/telemetry` → functions dedicadas
  
  > A função de batch de telemetria foi removida. Registre eventos via `/telemetry`, que no MVP atual **não persiste** (retorna apenas um `204` como ACK).  A gravação em `ncs_audit_log` fica para uma evolução futura.

## Env vars
Use `docs/ENV.md` como referência única.
