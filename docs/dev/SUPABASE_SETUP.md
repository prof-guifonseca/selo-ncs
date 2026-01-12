# Supabase — setup determinístico (SQL)

Este repo mantém o setup do Supabase como “pipeline” de SQL versionado em `docs/dev/supabase/`.

## Ordem sugerida (sem mistério)

1) `10_schema.sql`  
   - cria tabelas, constraints e índices base

2) `20_security.sql`  
   - habilita RLS e define policies (quando aplicável)

3) `30_rpc.sql`  
   - funções/rotinas (se usadas)

4) `40_storage.sql`  
   - preparação de bucket/policies de Storage (quando aplicável)

5) `50_seed.sql`  
   - dados mínimos de seed (somente para ambientes de teste)

## Observação importante sobre RLS

- RLS só é efetivo quando:
  - as tabelas têm RLS habilitado
  - as policies estão corretas
  - o backend realmente opera com anon key + JWT (`NCS_USE_RLS=1`)

Se você liga RLS no banco mas o backend ainda usa service role para tudo,
na prática você não está colhendo os benefícios.

## Onde o código espera essas coisas

- `netlify/functions/api/supabase.js` — clientes, REST e helpers de storage
- `netlify/functions/api/auth.js` — JWT e cookies
- `netlify/functions/api/core.js` — gates, CORS e headers
