# Arquitetura (real) — SPA + Netlify Functions + Supabase

**Data:** 2026-01-06  
Este documento descreve a arquitetura **como ela está no repositório**, não “como era”.

## Visão de alto nível

```
[ Browser ]
   |
   | 1) GET / (static)
   v
[ Netlify Static Hosting ]  --->  /dist (gerado por build.js)
   |
   | 2) XHR/fetch (credentials: include)
   v
[ /api/* ]  -> redirect ->  /.netlify/functions/api  ->  netlify/functions/api/index.js
   |
   | 3) REST / regras / persistência
   v
[ Supabase ]
  - Postgres (multi-tenant)
  - Storage (bucket p/ evidências)
```

## Build “static-first” (o que acontece no `node build.js`)

1) Lê `index.html` (shell) com marcas `<!-- include: ... -->`
2) Substitui includes por arquivos em `/partials`
3) Copia `src/`, `styles/`, `assets/`, `images/`, `docs/` e páginas auxiliares para `/dist`
4) Gera um `dist/manifest.json` (útil para smoke/diagnóstico)

**Por quê isso importa:** o app não depende de bundler; o custo operacional é baixo e o deploy é previsível.

## Frontend (módulos principais)

- **Bootstrap**: `src/main.js`  
  Liga navbar, router, actions, chat e fluxo de auth (hidratação de sessão).

- **Roteamento / Views**: `src/router.js`  
  Troca de views via `data-view` e History API (pathname + query string). O roteador
  interpreta o caminho e parâmetros de consulta para determinar a view e
  âncora, convertendo fragmentos legados com `#` para caminhos equivalentes;
  dashboards continuam a ser partials estáticos.

- **Ações**: `src/actions.js`  
  Event delegation por `data-action`, chamando o driver de API.

- **Auth / Sessão**: `src/auth.js`, `src/state.js`  
  Sessão **não deve** depender de localStorage para tokens; a sessão é cookie-first.

- **Driver HTTP**:
  - `src/services/remoteDriver.js`: fetch + parse + erros.
  - `src/services/api.js`: métodos semânticos (processes/evidences/public/report/admin).

### Fonte única do API base (no front)
- `index.html` define `window.NCS_API_BASE` via meta/body.
- O driver usa esse base (contrato) e sempre envia `credentials: 'include'`.

## Backend (Netlify Functions)

### Entry point
- `netlify/functions/api.js` é um wrapper (entry da function).
- O roteamento real está em `netlify/functions/api/index.js`.

### Núcleo
- `netlify/functions/api/core.js`:
  - config + gates (`NCS_REQUIRE_AUTH`, `NCS_USE_RLS`)
  - CORS e headers
  - helpers para respostas e erros

  - `netlify/functions/api/auth.js`:
  - login / refresh / logout
  - cookies HttpOnly
  - autenticação baseada em cookies e JWT do usuário (RLS obrigatório; modo baseline removido)

### Rotas (por domínio)
- `routes_processes.js`: processos + decisões + atribuições + anexos
- `routes_evidences.js`: evidências (presign/commit/view)
- `routes_public.js` e `routes_public_extras.js`: páginas públicas + publish/preview
- `routes_companies.js`, `routes_memberships.js`, `routes_assignments.js`: mínimo de administração
- `routes_session.js`, `routes_appstate.js`: sessão vs app‑state
- `routes_health.js`: healthcheck
  - `routes_audit_log.js`: trilha de auditoria por processo

Além das rotas incluídas no módulo `api`, o Netlify Functions expõe
handlers dedicados para:

- `report.js`: gera um relatório JSON ou HTML imprimível para
  processos via `/api/report`.  Executa com privilégios de admin/auditor
  e compõe informações do processo e audit trail.
- `chat.js`: stub de integração de chat (hoje não persiste nem envia
  mensagens reais; é um protótipo para interações futuras).
 - `telemetry.js`: endpoint de telemetria assíncrona.  Aceita `POST` com
   payloads JSON (objeto/array), valida tamanho e tipo e responde com
   status `204 No Content` sem persistir o evento.  No estágio atual do
   MVP esse endpoint atua apenas como **ACK** de recebimento e um gancho
   para observabilidade futura; a gravação em `ncs_audit_log` será
   considerada numa versão posterior.

> A função legacy `telemetry-batch.js` foi removida.  Antigos
> consumidores devem migrar para `/api/telemetry`, que é o único canal
> de coleta.

## Modelo de dados (Supabase)

A base está em `docs/dev/supabase/*.sql` (pipeline determinístico).
Tabelas nucleares (nomes como no schema):

- `ncs_companies`
- `ncs_memberships`
- `ncs_processes`
- `ncs_evidences`
- `ncs_public_pages`
- `ncs_audit_log`
- `ncs_app_state`

## Segurança: RLS obrigatória

O backend opera sempre com **Row Level Security (RLS)** ativada.  Não existe mais
um “modo baseline”; qualquer tentativa de desabilitar RLS via
`NCS_USE_RLS=0`, `false` ou `no` resulta em um erro de misconfiguração e o
backend não inicia.  A chave anônima do Supabase (`SUPABASE_ANON_KEY`) é
necessária para autenticar os usuários, e a chave de service role
(`SUPABASE_SERVICE_ROLE_KEY`) é usada apenas para operações administrativas
específicas (por exemplo, geração de URLs assinadas).  Consulte
`docs/SECURITY_MODEL.md` e `docs/dev/SECURITY_MODEL.md` para detalhes
operacionais.

## Pontos que merecem atenção (arquitetura)

No momento não há rotas legadas críticas na API.  O antigo caminho `/api/auditor/*`
foi removido do roteador e qualquer chamada a esse prefixo resulta em 404,
eliminando a possibilidade de recursão acidental.  Consulte
`docs/DIAGNOSTIC.md` para detalhes adicionais.
- Há dependências NPM potencialmente não usadas no runtime (`openai`, `@supabase/supabase-js`), afetando supply chain e previsibilidade (ver `docs/DIAGNOSTIC.md`).
