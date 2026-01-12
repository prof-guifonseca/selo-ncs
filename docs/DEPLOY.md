# Deploy (Netlify) — como está configurado

## O que o Netlify faz neste repo

- **Build command:** `node build.js`
- **Publish dir:** `dist`
- **Functions:** `netlify/functions`

Fonte: `netlify.toml`.

## Rotas/redirects importantes

Em `netlify.toml`:

- `/api/*` → `/.netlify/functions/api/:splat`
- `/report` → `/.netlify/functions/report`
- `/chat` → `/.netlify/functions/chat`
 - `/telemetry` → `/.netlify/functions/telemetry`
   
   > Observação: a rota antiga `/telemetry-batch` foi removida. Todos os eventos são enviados via `/telemetry`, que **apenas devolve ACK** (retorna `204` sem gravar dados).  A persistência em `ncs_audit_log` poderá ser implementada futuramente, mas não faz parte do MVP atual.

Ou seja: o front fala com `/api` e o Netlify resolve para a function.

## Variáveis de ambiente no Netlify

Defina no site:

- `SUPABASE_URL`
- `SUPABASE_BUCKET`
- `SUPABASE_SERVICE_ROLE_KEY`  
  Chave de service role para operações administrativas e geração de URLs assinadas.
- `SUPABASE_ANON_KEY`  
  Chave anônima necessária para operar em modo RLS (obrigatória).
- `NCS_REQUIRE_AUTH`
- `NCS_USE_RLS`  
  Deve estar definido como `1` (ou pode ser omitido).  Qualquer outro valor
  desativa o backend com erro de misconfiguração.
- `NCS_CORS_ORIGIN`
- `NCS_COOKIE_SAMESITE`
- `NCS_SECURE_COOKIES`
- `NCS_REFRESH_COOKIE_MAX_AGE`
- `NCS_LOGIN_RATE_LIMIT`

E opcional (se ativar IA no chat):
- `OPENAI_API_KEY`
- `OPENAI_MODEL` / `OPENAI_BASE_URL`

## Headers de segurança

`netlify.toml` já define:
- CSP (Content-Security-Policy)
- Frame protections (`X-Frame-Options`, `frame-ancestors`)
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Content-Type-Options`
- `X-XSS-Protection`

Verifique se o CSP acompanha:
- os domínios do Supabase (API + Storage)
- e quaisquer assets externos que você venha a adicionar

## Deploy “sem drama” (boas práticas)

- Manter o build sem dependências de bundler e sem headless pesado (já é o caso).
- Travar reprodutibilidade (commit de `package-lock.json`) antes de tentar CI sério.
- Rodar os smoke tests como gate (ver `docs/SMOKE_TESTS.md`).
