# API — Contrato Real

**Data:** 2026-01-06  
Este documento descreve os endpoints expostos pelo backend (`/.netlify/functions`) conforme implementado no roteador e nos handlers dedicados. Use‑o como referência de contrato; não invente rotas além das listadas.

## Convenções gerais

- **Base:** todas as rotas abaixo são prefixadas por `/api`. Por exemplo, `GET /api/health`.
- **Autenticação:** rotas marcadas como “requer auth” necessitam de sessão válida (cookie HttpOnly ou bearer token). Quando `NCS_REQUIRE_AUTH=1`, requisições sem sessão retornam 401.
- **RLS:** o backend opera sempre com RLS ativado.  Os acessos aos dados são filtrados pelo banco de dados usando o JWT do usuário.  Definir `NCS_USE_RLS` como `0`, `false` ou `no` é uma misconfiguração e resulta em erro `503`.
- **Formatos:** os corpos de requisição e resposta são JSON salvo indicação em contrário. Campos e respostas ausentes devem ser tratados como `null` ou omitidos.
- **Status codes:** 200 para sucesso, 4xx para erros de cliente e 5xx para erros internos. Métodos não suportados retornam 405 com header `Allow`.

## health

| Método | Caminho              | Auth | Descrição |
|-------|----------------------|------|----------|
| GET/HEAD | `/api/health`      | Não | Retorna `{ ok: true, time: <ISO>, context, auth_required, rls_enabled }`. Útil para monitoramento. Outros métodos retornam 405. |

## auth

| Método | Caminho                | Auth | Descrição |
|-------|------------------------|------|----------|
| POST  | `/api/auth/login`      | Não | Aceita `{ email, password }`. Retorna `{ ok, user, role, roles, expires_in }` e define cookies de sessão/refresh. Rate‑limited. |
| GET/HEAD | `/api/auth/me`       | Sim | Retorna o usuário autenticado `{ ok, user, role, roles }`. Quando chamado com HEAD, o corpo é omitido. |
| POST  | `/api/auth/logout`     | Sim | Encerra a sessão atual e limpa cookies. Sempre retorna `{ ok: true }`. |
| any  | `/api/auth/*`           | — | Demais caminhos retornam 404. Métodos incorretos retornam 405. |

Notas: quando `SUPABASE_URL` ou chaves estão ausentes, rotas de auth retornam 503.

## app‑state

Permite persistir preferências de UI por usuário.

| Método | Caminho            | Auth | Descrição |
|-------|--------------------|------|----------|
| GET   | `/api/app-state`   | Sim | Retorna o estado persistido (objeto) do usuário autenticado.  Requer JWT válido. |
| POST/PUT | `/api/app-state` | Sim | Substitui ou cria o estado para o usuário autenticado. Aceita qualquer JSON. |
| —     | —                  | — | A rota exige RLS ativado; se o backend detectar `NCS_USE_RLS` desativado retornará 503. Métodos não listados retornam 405. |

## session

Armazena um pequeno blob de sessão (por exemplo, último processo aberto).

| Método | Caminho           | Auth | Descrição |
|-------|-------------------|------|----------|
| GET   | `/api/session`    | Sim | Retorna `{ ... }` com os dados persistidos para o usuário autenticado. |
| POST/PUT | `/api/session` | Sim | Grava os dados da sessão do usuário atual. |
| —     | —                 | — | Exige RLS; se `NCS_USE_RLS` estiver desativado o backend responde 503. Métodos não listados retornam 405. |

## processes

Gerencia processos (ciclos de certificação) e suas operações derivadas.

### Operações gerais

| Método | Caminho             | Auth | Descrição |
|-------|---------------------|------|----------|
| GET   | `/api/processes`    | Sim | Lista processos visíveis. Parâmetros opcionais: `limit` (1–200, default 50), `stage` (filtra por estágio), `auditorEmail` (filtra por e‑mail de auditor). Admins vêem todos; clientes vêem seus processos; auditores vêem processos designados. |
| POST  | `/api/processes`    | Sim | Cria ou atualiza um processo. O corpo deve incluir ao menos `{ company }`. Campos adicionais (payload) são aceitos. Calcula KPI server‑side. Retorna o payload completo incluindo `id`. |
| any   | `/api/processes`    | — | Métodos não suportados retornam 405. |

### Operações de submissão

| Método | Caminho                          | Auth | Descrição |
|-------|----------------------------------|------|----------|
| POST  | `/api/processes/submission`      | Sim | Altera o estágio de um processo. O corpo deve conter `{ process_id, action }`, onde `process_id` é o identificador do processo. O campo `action` determina a próxima etapa: `submit` muda para `audit`, `approve` para `ready_for_decision`, `reject` para `returned`, `align` para `alinhamento` e `return` para `operation`. Valores diferentes destes são utilizados como estágios customizados. O campo `process_id` é o único aceito; aliases legados como `processId` ou `id` foram removidos. |

### Operações por id

| Método | Caminho                                   | Auth | Descrição |
|-------|-------------------------------------------|------|----------|
| GET   | `/api/processes/{id}`                     | Sim | Retorna o payload de um processo por id. Acesso restrito ao dono, auditor designado ou admin. |
| POST  | `/api/processes/{id}/evidences`           | Sim | Anexa evidências a um processo. Corpo `{ evidenceIds: [id, ...] }` ou `{ evidenceId }`. Retorna o payload atualizado. |
| DELETE| `/api/processes/{id}/evidences/{evidenceId}` | Sim | Remove uma evidência da lista do processo. Retorna payload atualizado. |
| PATCH | `/api/processes/{id}/triage`              | Sim | Atualiza o objeto de triagem (`payload.triage`). Merges com dados existentes. |
| PATCH | `/api/processes/{id}/assignment`          | Sim (admin) | Atualiza `assignedAuditors`. O corpo deve conter `{ assignedAuditors: [] }`. Somente admins. |
| PATCH | `/api/processes/{id}/reviews`             | Sim | Atualiza o objeto de reviews (`payload.reviews`). Merges com dados existentes. |
| PATCH | `/api/processes/{id}/decision`            | Sim | Atualiza o objeto de decisão (`payload.decision`). Merges e registra evento na audit trail. |
| any   | `/api/processes/{id}/...`                 | — | Rotas ou métodos não listados retornam 405. |

## evidences

Gerencia arquivos de evidência vinculados a processos.

### Listagem

| Método | Caminho            | Auth | Descrição |
|-------|--------------------|------|----------|
| GET   | `/api/evidences`   | Sim | Lista evidências. Parâmetros opcionais: `pillar`, `indicatorId`, `limit` (máx. 500). Clients vêem suas evidências; auditores vêem evidências de processos designados; admins vêem todas. |

### Operações por id

| Método | Caminho                                      | Auth | Descrição |
|-------|----------------------------------------------|------|----------|
| GET   | `/api/evidences/{id}`                        | Sim | Retorna `{ ok, evidenceId, url, meta }` com um link assinado (download) e metadados. |
| GET   | `/api/evidences/{id}/meta`                   | Sim | Retorna somente os metadados. |
| GET   | `/api/evidences/{id}/object-url`             | Sim | Retorna `{ url, meta }` com URL assinada (download). |
| GET   | `/api/evidences/{id}/view`                   | Sim | Retorna `{ url, meta }` com URL assinada para visualização inline (expira rapidamente). |
| POST  | `/api/evidences/{id}/presign`                | Sim | Gera URL de upload assinado. Corpo `{ meta }`. Retorna `{ uploadUrl, objectKey, headers }`. |
| POST  | `/api/evidences/{id}/commit`                 | Sim | Finaliza o upload após o presign. Corpo `{ objectKey, meta }`. Verifica existência no storage e grava registro; retorna `{ ok, evidenceId, url, meta }`. |
| DELETE| `/api/evidences/{id}`                        | Sim | Remove a evidência e o arquivo associado. Somente o dono ou admin podem remover. |
| any   | `/api/evidences/{id}/...`                    | — | Métodos não listados retornam 405. |

## public‑pages

Páginas públicas (perfil da organização e selo).

| Método | Caminho                   | Auth | Descrição |
|-------|---------------------------|------|----------|
| GET/HEAD | `/api/public-pages`    | Não | Lista páginas públicas publicadas. Parâmetros opcionais: `q` (filtro por slug) e `limit` (1–50). Responde `{ items: [ { slug, company_name, level? } ] }`. |
| GET/HEAD | `/api/public-pages/{slug}` | Não | Retorna uma página publicada `{ slug, payload }` com campos sanitizados. |
| POST  | `/api/public-pages`       | Sim (admin) | Cria ou atualiza uma página pública. Corpo `{ slug?, payload, published? }`. `payload` deve incluir campos como `company_name`, `level`, `issued_at`, `expires_at` etc. Retorna `{ ok, slug, url }`. |
| any   | `/api/public-pages/...`   | — | Métodos não listados retornam 405. |

## public (preview/publish)

| Método | Caminho                                 | Auth | Descrição |
|-------|-----------------------------------------|------|----------|
| GET/HEAD | `/api/public/preview`                 | Sim | Gera um preview de página pública a partir de um processo. Query param obrigatório: `process_id` (identificador do processo). Param opcional `format=html|json`. Para `format=json` retorna `{ id, payload }`; para `html` retorna HTML. Aliases legados (`processId`, `id`) foram removidos. Não persiste dados. |
| POST  | `/api/public/publish`                   | Sim | Publica ou atualiza uma página a partir de um processo. O corpo deve conter `{ process_id }`. Retorna `{ public_id, url }`. O campo `process_id` é o único aceito (aliases legados removidos). |
| —     | —                                       | — | Ações não listadas retornam 405. |

Notas: preview e publish honram RLS quando habilitado. O slug é derivado do nome da empresa.

## companies

Administra empresas (tenants).

| Método | Caminho             | Auth | Descrição |
|-------|---------------------|------|----------|
| GET   | `/api/companies`    | Sim (admin) | Lista empresas `{ id, name, slug, meta, created_at }`. |
| POST  | `/api/companies`    | Sim (admin) | Cria ou atualiza uma empresa. Corpo `{ name, slug?, meta? }`. Retorna `{ ok, company }`. |
| any   | `/api/companies`    | — | Métodos não suportados retornam 405. |

## memberships

Gerencia papéis de usuários.

| Método | Caminho                    | Auth | Descrição |
|-------|----------------------------|------|----------|
| GET   | `/api/memberships`         | Sim (admin) | Lista memberships. Parâmetro opcional: `company_id` para filtrar. |
| POST  | `/api/memberships`         | Sim (admin) | Cria ou atualiza um membership. Corpo `{ user_id, company_id?, role, is_active? }`. `role` deve ser `admin`, `auditor` ou `client`. |
| PATCH | `/api/memberships/{id}`    | Sim (admin) | Atualiza o campo `is_active` de um membership. Corpo `{ is_active }`. |
| any   | `/api/memberships/...`     | — | Outros caminhos retornam 404 ou 405. |

## assignments

Atribui auditores a processos.

| Método | Caminho                           | Auth | Descrição |
|-------|-----------------------------------|------|----------|
| GET   | `/api/assignments`                | Sim (admin) | Lista atribuições. Parâmetro opcional: `process_id` para filtrar. |
| POST  | `/api/assignments/bulk`           | Sim (admin) | Atribui auditor principal e revisor em lote. Corpo `{ process_id, principal_id, reviewer_id }`. Os IDs não podem ser iguais. |
| POST  | `/api/assignments`                | Sim (admin) | Cria ou atualiza uma única atribuição. Corpo `{ process_id, auditor_id, role }` onde `role` é `principal` ou `reviewer`. |
| any   | `/api/assignments/...`            | — | Outros caminhos retornam 404 ou 405. |

## admin

Utilidades administrativas adicionais. Todas as rotas deste segmento exigem
sessão válida com papel **admin**.

| Método | Caminho                    | Auth        | Descrição |
|-------|----------------------------|-------------|----------|
| POST  | `/api/admin/resolve-user`  | Sim (admin) | Resolve um usuário pelo e‑mail. O corpo deve incluir `{ email }`. Quando o usuário existe em `auth.users`, retorna `{ ok: true, user: { id, email } }`. Se nenhum registro corresponder, retorna `{ ok: false }`. Requisições com e‑mail inválido retornam **400** e usuários não‑admins recebem **403**. |
| any   | `/api/admin/*`             | —           | Demais caminhos ou métodos retornam 404 ou 405. |

## audit‑log

Leitura de trilha de auditoria.

| Método | Caminho                 | Auth | Descrição |
|-------|-------------------------|------|----------|
| GET   | `/api/audit-log`        | Sim | Retorna a lista de eventos para um processo. Parâmetros obrigatórios: `process_id`; opcionais: `limit` (máx. 200) e `before` (timestamp ISO para paginação). Responde com um array de entradas do log ordenadas por `occurred_at` desc. Cada item possui as chaves canônicas `event_type`, `actor_user_id`, `company_id`, `process_id`, `meta` e `occurred_at`. Aliases legados (`action`, `actor_id`, `entity_id`, `created_at`) foram descontinuados. |
| any   | `/api/audit-log`        | — | Métodos não suportados retornam 405. |

## report (função dedicada)

`/api/report` mapeia para `/.netlify/functions/report`.

| Método | Caminho        | Auth | Descrição |
|-------|----------------|------|----------|
| GET   | `/api/report`  | Sim (admin ou auditor) | Gera um relatório de um processo. Query param `process_id` (ou `id`). O header `Accept` controla o formato: `text/html` retorna HTML imprimível; outros valores retornam JSON `{ process_id, generated_at, data, kpis }`. Requer sessão com papel `admin` ou `auditor`. |
| any   | `/api/report`  | — | Outros métodos retornam 405. |

## chat (função dedicada)

`/api/chat` mapeia para `/.netlify/functions/chat`.

| Método | Caminho      | Auth | Descrição |
|-------|--------------|------|----------|
| POST  | `/api/chat`  | Não | Stub de chat. Aceita `{ message, context? }`. Aplica rate‑limit por IP e pode devolver respostas genéricas ou integrar com OpenAI quando configurado. Quando a integração está desativada retorna 501. |
| any   | `/api/chat`  | — | Métodos não suportados retornam 405. |

## telemetry (função dedicada)

`/api/telemetry` mapeia para `/.netlify/functions/telemetry`.

| Método | Caminho            | Auth | Descrição |
|-------|--------------------|------|----------|
| POST  | `/api/telemetry`   | Não | Coleta eventos de telemetria. Corpo JSON (objeto ou array). Valida tamanho (<80 KB) e tipo; retorna `204 No Content` como **ACK** sem persistir (não cria registros no `ncs_audit_log`). |
| OPTIONS | `/api/telemetry` | Não | CORS preflight. |
| any   | `/api/telemetry`   | — | Outros métodos retornam 405. |

---

### Endpoints removidos

- `/api/auditor/*` — não existe mais; chamadas retornam 404 imediato.
- `telemetry-batch` — função removida. Use `/api/telemetry` para enviar eventos individuais.