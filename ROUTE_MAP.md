# Route Map (UI + API)

**Data:** 2026-01-06  
Este arquivo existe para bater o olho e saber rapidamente “o que existe” sem abrir diversos arquivos.  Esta versão foi alinhada ao roteador real e elimina referências a rotas fantasmas.

## UI (SPA — rotas por path)

O roteamento do front agora utiliza a **History API** (pathname + query string) em vez de fragmentos (`#`).  
Rotas legadas com `#` são automaticamente convertidas para as rotas abaixo durante um período de transição.

As views são parciais injetadas (build) e renderizadas pelo router.

Rotas confirmadas (e respectivas partials) em `/partials`:

- `/` → landing (fragmentos como hero, NCS, como funciona, níveis, indicadores, imparcialidade, etc. são acessados via `/?section=alguma‑coisa`)
- `/login` → `partials/login-client-view.html` (página de login padrão)
- `/dashboard` → redireciona para `/dashboard/<papel>` de acordo com o papel do usuário (client, auditor ou admin)
- `/dashboard/client` → `partials/client-dashboard.html`
- `/dashboard/auditor` → `partials/auditor-dashboard.html`
- `/dashboard/admin` → `partials/admin-dashboard.html`
- `/dashboard/admin?anchor=configuracoes` → `partials/admin-dashboard.html` (seção de Administração; substitui a antiga rota `#admin-memberships`)

Outros `login` específicos (avaliador/gestor) e a view stub `admin-memberships` permanecem no código apenas por compatibilidade, mas todos os caminhos novos seguem o modelo acima.  

> O bootstrap principal continua sendo `src/main.js`.

## Backend (API)

**Base:** `/api` → `/.netlify/functions/api`

Os segmentos abaixo são expostos pelo roteador em `netlify/functions/api/index.js`.  Cada segmento pode ter sub‑rotas e métodos específicos; para detalhes de payloads, parâmetros e regras de autorização consulte `docs/API.md`.

- **health** – healthcheck simples; **sem autenticação**; aceita `GET`/`HEAD` e responde um JSON com campos mínimos.  A resposta típica é `{ ok: true, time: <ISO>, context, auth_required, rls_enabled }`.
- **auth** – login (`POST /auth/login`), sessão atual (`GET/HEAD /auth/me`) e logout (`POST /auth/logout`).
- **app-state** – leitura e escrita de preferências por usuário (RLS obrigatório).
- **session** – armazenamento de sessão persistente por usuário (RLS obrigatório).
- **processes** – criação, listagem, leitura por id e transições de estágio (submit, approve, reject, align, return ou valores customizados); inclui gestão de evidências, triagens, decisões, reviews e atribuições.
- **evidences** – operações de upload, presign, commit, listagem e leitura de evidências.
- **public-pages** – listagem e CRUD de páginas públicas; leitura anônima e escrita restrita a admins.
- **public** – preview de página a partir de processo (`GET /public/preview`) e publicação (`POST /public/publish`).
- **companies** – cadastro e listagem de empresas (admin).
- **memberships** – gestão de memberships/roles (admin).
- **assignments** – atribuição de auditores a processos (admin), incluindo operações em lote.
- **admin** – utilidades administrativas adicionais.  Atualmente expõe
  `POST /admin/resolve-user`, que busca um usuário em `auth.users` pelo email e
  retorna seu `user_id` para facilitar a criação de vínculos.
- **audit-log** – leitura da trilha de auditoria por processo.

> **Importante:** a rota legacy `/api/auditor/*` foi removida.  Qualquer chamada para esse prefixo retorna 404 imediatamente; não há fallback ou stub parcial.

## Funções dedicadas (fora do router)

As funções abaixo ficam fora do roteador principal e são mapeadas via redirects em `netlify.toml`:

- `/.netlify/functions/report` (via `/api/report`) – gera um relatório JSON ou HTML imprimível para um processo; requer sessão admin ou auditor.
- `/.netlify/functions/chat` (via `/api/chat`) – stub de integração de chat, dependente de configuração; quando desativado retorna 501.
 - `/.netlify/functions/telemetry` (via `/api/telemetry`) – coleta eventos de telemetria.  Aceita `POST` com JSON, valida o payload e responde `204 No Content` **sem persistir** (ACK‑only).  Este endpoint é um gancho para diagnósticos e observabilidade futura; não grava registros no `ncs_audit_log` no estágio atual.

> Não existe mais a função `telemetry-batch`.  Chamadas para o endpoint antigo retornam 404; toda coleta de telemetria ocorre via `telemetry.js`.
