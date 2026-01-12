# STATUS — Matriz de Verdade do Repo

**Data:** 2026-01-10  
**Objetivo:** esta página é a referência única para entender “o que funciona” *no código atual*, sem depender de docs antigos.

## Foto do estágio (o que já está sólido)

### Produto / UX (front)
- Shell + partials: `index.html` + `/partials/*` (gerados no build por `build.js`).
- SPA com roteamento e views: `src/router.js`, `src/navbar.js`, `src/main.js`.
- Ações via *event delegation* (data‑action): `src/actions.js`.
- **Dashboards separados (cliente / avaliador / gestor) via partials**
  - `partials/client-dashboard.html`
  - `partials/auditor-dashboard.html`
  - `partials/admin-dashboard.html`
  - tela interna de memberships: `partials/admin-memberships.html`

  Os dashboards por papel foram revisados para garantir **usabilidade real** e aderência ao regulamento. Cada painel agora anuncia carregamento e falha via elemento `announcer`, trata estados vazios e erros com mensagens humanizadas e possui espaços marcados explicitamente como “Em piloto”, “Em implementação” ou “Faseado” quando uma funcionalidade ainda depende do backend, em vez de comentários `// TODO`. Os callouts permanecem citando o item correspondente do regulamento. A linguagem empregada nos CTAs, toasts e callouts está alinhada com os termos de `/docs/regulation-program.html`.

  A antiga experiência de demonstração foi descontinuada. O projeto não suporta mais parâmetros de query para habilitar demonstrações e não inclui drivers ou overlays de demonstração. Todas as interações agora ocorrem exclusivamente contra o backend real.

  Para orientar novas implementações, foi criada a documentação de
  **padrão de UI** em `docs/DEV_UI.md`, detalhando renderizadores
  puros, escapes obrigatórios, helpers de formulários e micro‑binding.  A
  regressão manual dos fluxos principais está descrita em
  `docs/SMOKE_DASHBOARDS.md`, que complementa os smoke tests automáticos.

### Backend (Netlify Functions)
- API principal: `/.netlify/functions/api` (router em `netlify/functions/api/index.js`).
- Relatório: `/.netlify/functions/report` (`netlify/functions/report.js`), com **JSON + HTML imprimível**.
- Evidências: presign/commit/view em `netlify/functions/api/routes_evidences.js`.
- Publicação/preview:
  - CRUD de páginas públicas: `netlify/functions/api/routes_public.js` (`/api/public-pages`)
  - Preview/publish: `netlify/functions/api/routes_public_extras.js` (`/api/public/*`)
- Administração mínima (sem SQL manual):
  - companies: `netlify/functions/api/routes_companies.js`
  - memberships: `netlify/functions/api/routes_memberships.js`
  - assignments: `netlify/functions/api/routes_assignments.js`

  - audit log: `netlify/functions/api/routes_audit_log.js` (`/api/audit-log`) — leitura de trilha de eventos por processo com filtros opcionais (`limit`, `before`).
  - **Telemetria v0**: o endpoint dedicado `/.netlify/functions/telemetry` (exposto via
    `/api/telemetry`) não persiste dados em banco.  Cada POST com JSON é
    validado e registrado como uma linha única de JSON em stdout contendo
    `ts`, `level`, `event`, `route`, `version`, `request_id` e `brand`.
    Eventos `error` ou `fatal` são sempre logados e, se a variável
    `ALERT_WEBHOOK_URL` estiver definida, são encaminhados para esse
    webhook com timeout curto; demais níveis são amostrados (~10%,
    configurável via `NCS_TELEMETRY_SAMPLE_RATE`).

### Segurança (cookie-first + RLS obrigatório)
- Cookie‑first (sessão HttpOnly): `netlify/functions/api/auth.js` + `core.js`.
- **RLS obrigatório (Supabase):** o backend opera sempre com RLS; acessa dados via `SUPABASE_ANON_KEY` + JWT do usuário.
- **Gates de segurança**:
  - `NCS_REQUIRE_AUTH`: força 401 sem sessão em rotas protegidas.
  - `NCS_USE_RLS`: **guarda de misconfig** (não é toggle). `0/false/no` → API retorna `503` com `MISCONFIG_RLS_DISABLED`; `1` (ou omitido) → ok.
- Smoke do backend cobre gates mínimos: `scripts/smoke_backend.mjs`.


## O que ainda é legado / “zona cinzenta”
### Compatibilidade e estado local no front
Desde a migração para o modelo “server‑first” (rotas reais), as camadas de compatibilidade antigas foram praticamente removidas. O módulo `src/services/api.js` agora delega todas as chamadas ao backend via `remoteDriver.js` e não implementa mais stubs ou fallbacks de APIs antigas. Ainda existem alguns módulos que mantêm estado apenas para a UI:

- `src/audit.js`: mantém um array em memória para renderizar o log de auditoria no navegador. **Isso não persiste dados reais**; a fonte de verdade é o backend (`/api/audit-log`). O array local pode ser usado para exportar ou renderizar rapidamente, mas não substitui a trilha de auditoria persistente.
  - `src/state.js`: serve como pequena store reativa para preferências de UI. Não expõe mais a store legada, e quaisquer valores persistidos são salvos via `/api/app-state`.
- `src/ui.js`: hoje apenas reexporta helpers para facilitar migração; não injeta funções críticas em `window`.

**Impacto:** a superfície de bugs diminuiu. O front depende integralmente das rotas do backend para dados. Os módulos que operam em memória devem ser entendidos como temporários para UX (não como persistência).

### Dependências e reprodutibilidade
O `package.json` do projeto foi simplificado: as dependências `openai` e `@supabase/supabase-js` foram removidas porque o código usa `fetch` para integrar com serviços externos. Restam apenas `typescript` e `@types/node` como `devDependencies`.

O repositório inclui um `package-lock.json` com versões travadas. O script de CI (`npm run ci`) roda `npm run build`, smoke tests e checagem de docs. Executar `npm ci` em pipelines garante builds determinísticos.

Além dos testes e do build, o CI agora executa `npm run check:docs`, que
verifica a presença de documentos obrigatórios (como `LICENSE`, `NOTICE`,
`COPYRIGHT.md` e dossiês de propriedade intelectual).  A ausência de
qualquer desses arquivos faz o pipeline falhar, prevenindo a erosão de
documentação ao longo do tempo.

**Impacto:** supply chain menor, CI previsível e reprodutibilidade garantida.

### Testes automatizados (E2E)

O projeto agora inclui uma suíte mínima de **testes end‑to‑end (E2E)** escrita com [Playwright](https://playwright.dev/).  Estes testes automatizados cobrem
três cenários fundamentais:

* A navegação pública (“landing page”) carrega sem lançar erros críticos no console.
* A transição da landing para a tela de login via botão “Painel” não insere um fragmento `#` na URL (regressão comum em SPAs).
* No painel do avaliador, após carregar um processo, as abas de detalhe (Evidências, Indicadores, Parecer e Status) podem ser navegadas sequencialmente, com atualização correta de `aria-selected`, `tabindex` e classe `active`.  Isto previne o bug observado anteriormente em que o painel ficava preso no resumo.

Os testes residem em `tests/` e podem ser executados com `npm run e2e` após instalar o navegador via `npm run e2e:install`.  O workflow de CI está configurado para rodar essa suíte e salvar um resumo em `docs/evidencias/E2E_AUTOMATED_RESULT.txt`.  Falhas geram screenshots automaticamente no artefato de saída.

## Inconsistências detectadas (devem entrar no backlog)

Atualmente não há inconsistências de contrato críticas conhecidas.  O
antigo caminho `/api/auditor/*` foi removido completamente e o roteador não o
reconhece mais.  Assim, requisições para esse prefixo retornam 404 de forma
imediata, eliminando o risco de recursão ou timeouts.  Consulte `docs/DIAGNOSTIC.md` para um diagnóstico atualizado.

## Critérios de “pronto para staging sério” (checklist)
- `NCS_USE_RLS=1` e `NCS_REQUIRE_AUTH=1` em staging, com falhas seguras (401/503) comprovadas.
- Pelo menos 1 fluxo feliz completo: login → listar processos → evidências → relatório/preview.
- `scripts/smoke.mjs` e `scripts/smoke_backend.mjs` rodando como gate de CI.

## White‑label

Em janeiro de 2026 foi introduzida a versão inicial do **white‑label** do selo NCS. A iniciativa separa a
“casca” da marca (nomes, cores, logos e contatos) da “lógica” da aplicação, permitindo que o
mesmo núcleo seja reutilizado por diferentes parceiros. Esta versão inclui:

* Pasta `brands/` com um **pack** padrão (`cs`) contendo `config.json` e `brand.css`.
* Um loader em `src/brand.js` que resolve a marca por hostname, query string ou atributo
  `data-brand`, carrega a configuração, injeta o CSS e atualiza navbar/footer em tempo de execução.
* Pontos de ancoragem no HTML via IDs estáveis para logos, nome do programa e textos do rodapé.
* Build atualizado para copiar `brands/` para `dist/brands`.

O comportamento com a marca cs (padrão) permanece idêntico ao estado anterior, atendendo ao DoD,
mas agora é possível criar novas marcas adicionando um novo diretório em `brands/` com
configurações e variáveis de cor específicas.
