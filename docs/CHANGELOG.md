# Changelog

Este projeto usa **SemVer** (MAJOR.MINOR.PATCH).

- MAJOR: quebra de contrato (rotas, schema, UX crítica)
- MINOR: feature compatível
- PATCH: correções e hardening

## [Unreleased]
- **Observabilidade v0 (telemetria)**: o endpoint `/api/telemetry` foi revisado para
  registrar eventos em stdout de forma estruturada em vez de persistir em banco.
  Agora o handler filtra campos permitidos, adiciona `ts`, `level`, `event`,
  `route`, `version`, `request_id` e `brand` e imprime uma linha de JSON por
  evento.  Eventos não críticos são amostrados (~10%, configurável via
  `NCS_TELEMETRY_SAMPLE_RATE`); eventos `error` ou `fatal` são sempre
  registrados.  Se existir `ALERT_WEBHOOK_URL`, eventos críticos são
  encaminhados via `POST` para esse webhook com timeout curto.  Um módulo
  de front‑end (`src/telemetry/client.js`) captura erros globais e rejeições
  não tratadas e envia eventos com contexto de `pathname`, view ativa, papel
  e marca.  A captura pode ser desativada definindo `window.__NCS_TELEMETRY_OFF__`.

- **Gate de documentação**: adicionado o script `check:docs` que valida a
  presença de documentos obrigatórios (`LICENSE`, `NOTICE`, `COPYRIGHT.md`,
  `docs/ip/*`, etc.).  O script roda em `npm run ci` e falha caso algum
  arquivo crítico esteja ausente, prevenindo drift de documentação.

- **Limpeza de stubs e guia de contribuição**: arquivos de ponte `CHANGES.md`
  e `NOTES.md` na raiz foram removidos, pois seus conteúdos estavam
  consolidados em `docs/CHANGELOG.md`.  Todos os links no repositório
  continuam apontando para os locais oficiais.  Foi criado
  `docs/front/CONTRIBUTING_FRONT.md` com diretrizes práticas sobre como
  estruturar partials, usar `data-action`, seguir convenções de HTML/JS e
  rodar os *gates* locais (`npm run ci`, `npm run e2e` e contratos) antes de
  submeter um pull request.  O guia também descreve como adicionar uma
  nova view sem quebrar o roteador ou o contrato do front.
 - **Onboarding sem atrito (admin)**: novo endpoint `POST /api/admin/resolve-user` que permite ao gestor buscar um usuário a partir do e‑mail, retornando o `user_id` necessário para criar vínculos. Inclui RPC segura `ncs_resolve_user_by_email`, rota backend restrita a admins, atualização do painel do gestor com campo de e‑mail e botão “Buscar ID”, além de documentação e evidência de uso.

 - **Padrão oficial de UI documentado**: adicionada a página `docs/DEV_UI.md` com os princípios de renderização pura, uso obrigatório de `escapeHtml`, helpers de formulário (`getFormObject`/`fillForm`) e micro‑binding com `data-bind`/`bindText`.  A página removeu o antigo kill‑switch, pois a renderização por template agora é o único modo suportado.  Serve como guia de onboarding para quem modifica o front.

 - **Checklist manual de regressão para dashboards**: criado `docs/SMOKE_DASHBOARDS.md` descrevendo os fluxos essenciais para os dashboards de cliente, auditor e administrador.  O checklist complementa os smoke tests automáticos e deve ser executado em cada refatoração.

  - **E2E mínimo com Playwright**: adicionada uma suíte de testes end‑to‑end automatizados utilizando o [Playwright](https://playwright.dev/) que cobre a navegação pública e o painel do avaliador.  Os novos testes validam que a landing page carrega sem erros críticos no console, que a navegação até a tela de login não polui a URL com um `#` e que a troca de abas no detalhe do avaliador funciona corretamente (resolvendo a regressão onde o usuário ficava preso no resumo).  Para rodar a suíte, execute `npm run e2e` após instalar o navegador com `npm run e2e:install`.  O resultado da execução é salvo em `docs/evidencias/E2E_AUTOMATED_RESULT.txt` pelo workflow de CI.

## [1.2.0] - 2026-01-06

### Implementações principais

* **Cache‑busting determinístico**: o script de build (`build.js`) agora lê a versão do `package.json` e aplica um sufixo `?v=<version>` a todos os assets locais (`styles/` e `src/`), além de inserir uma `<meta name="ncs-build-version">` e `window.__NCS_BUILD.version` no HTML final.  Isso elimina variações de timestamp e garante que cada release gere o mesmo artefato.
* **Checklist objetivo de release**: novo arquivo `docs/RELEASE_CHECKLIST.md` descreve o passo a passo para preparar, validar e publicar um release, incluindo comandos concretos (`npm run ci`, `scripts/rls_probe.mjs`) e gates de verificação do artefato `dist/`.
* **Testes de contrato leves**: criado `scripts/contract_backend.mjs` com uma suíte mínima de testes de contrato sobre o backend (gates de autenticação, parâmetros obrigatórios e isolamento multi‑tenant).  O script roda em modo local/mock e é integrado ao CI via `npm run contract`; testes que dependem de Supabase são executados apenas quando `CONTRACT_BACKEND_LIVE=1` e as chaves exigidas estão presentes.
* **Prova prática de multi‑tenant (RLS)**: adicionado `scripts/rls_probe.mjs`, um utilitário manual que valida o isolamento de dados em staging ao comparar acessos de dois usuários/tenants distintos.  Inclui documentação em `docs/STAGING_RLS_PROOF.md` sobre como configurar e interpretar o resultado sem expor segredos.
* **Flag de IA (`NCS_AI_ENABLED`)**: implementada feature flag (default `0`) que governa o uso do ChatGPT/OpenAI no backend.  Quando desligada, o chat usa apenas respostas heurísticas locais, mesmo que `OPENAI_API_KEY` esteja definido.  Quando ativada (`1`), o backend permite chamadas à API e registra um log mínimo de uso contendo timestamp, ator, rota, modelo e tamanhos de entrada/saída (sem conteúdo integral do usuário).
* **Atualizações de documentação e exemplo de ambiente**: `docs/ENV.md` atualizado com `NCS_AI_ENABLED` e remoção de variáveis não implementadas; `.env.example` agora inclui a nova flag e instruções sobre seu valor padrão.  Foram adicionados `docs/RELEASE_CHECKLIST.md` e `docs/STAGING_RLS_PROOF.md`.
* **Integração ao CI**: o script `contract_backend.mjs` foi adicionado ao pipeline via `npm run ci`.  O CI agora falha em regressões óbvias detectadas pelos contratos e smoke tests.

## [0.0.0] - 2026-01-04
 - Rebase documental: novo arsenal de docs (arquitetura, status, diagnóstico, API, env, deploy, roadmap).

## Notas históricas consolidadas

Esta seção reúne anotações que antes estavam dispersas em arquivos
`CHANGES.md` e `NOTES.md` na raiz do repositório. O objetivo é preservar
o histórico de decisões e mudanças pontuais sem manter documentos
soltos. As notas não são parte do versionamento SemVer, mas servem
como registro de contexto para implementadores e revisores.

### Implementação de rota admin e novas transições de estágio

O backend recebeu um novo endpoint **`POST /api/admin/resolve-user`** que
permite ao gestor resolver um usuário a partir do e‑mail. A rota está
restrita a administradores autenticados e normaliza o e‑mail antes de
invocar a RPC `ncs_resolve_user_by_email`. Se houver usuário, a resposta
contém `{ ok: true, user: { id, email } }`; caso contrário, retorna
`{ ok: false }`. Erros de validação retornam **400** e requisições de
não‑admins retornam **403**. Além disso, o endpoint
`/api/processes/submission` passou a aceitar as ações adicionais
`align` (alinhamento) e `return` (operation), registrando cada
transição em `ncs_audit_log`.

Principais arquivos alterados/criados:

| Caminho | Tipo | Descrição |
|--------|------|-----------|
| `netlify/functions/api/routes_admin.js` | Novo | Implementa a rota administrativa `POST /api/admin/resolve-user` com validações de sessão/admin e chamadas à RPC segura. |
| `netlify/functions/api/index.js` | Modificado | Importa o novo handler e adiciona roteamento para o segmento `admin`. |
| `netlify/functions/api/routes_processes.js` | Modificado | Suporta ações `align` e `return` no endpoint `/api/processes/submission` e evita fallback para helpers admin quando RLS está ativado. |
| `netlify/functions/api/supabase.js` | Modificado | Adiciona guarda que lança `ADMIN_HELPER_DISABLED_RLS` quando RLS está ativado e alguém tenta usar service role. |
| `docs/API.md` | Modificado | Documenta o novo endpoint, seus parâmetros e respostas, além de atualizar a seção de processos para listar as novas ações. |
| `ROUTE_MAP.md` | Modificado | Atualiza a descrição dos segmentos para incluir o novo endpoint admin e as novas ações no fluxo de processos. |

Sumário de comportamento:

- **Rota administrativa**: apenas administradores autenticados podem invocar a rota; o e‑mail fornecido é normalizado e validado; a resposta varia conforme a existência do usuário.
- **Transições de estágio**: `align` e `return` são aceitas por `/api/processes/submission`; quando RLS está ativado, o backend não utiliza helpers admin e responde 404 quando o registro não está acessível.
- **Guarda para service role**: `_assertServiceRole` verifica `NCS_USE_RLS` e, quando habilitado, impede o uso de helpers admin para reforçar a política de não utilizar service role sob RLS.

Comandos executados durante a implementação:

| Comando | Resultado |
|---------|-----------|
| `npm run build` | Construiu o front e gerou a pasta `dist` sem erros. |
| `npm run smoke` | Validação de HTML/CSS passou: 10 arquivos HTML e 1 CSS verificados. |
| `npm run smoke:backend` | Todos os testes de smoke do backend passaram, incluindo o teste `rls_admin_helpers_throw`. |
| `npm run typecheck` | Executou o TypeScript compiler sem erros. |
| `npm run ci` | Executou a sequência completa de build, testes e contratos sem falhas. |

Observações adicionais:

- Não houve necessidade de migrações SQL, pois `ncs_processes.payload.stage` não é enum fixo.
- Em modo RLS (`NCS_USE_RLS=1`) os helpers admin ficam desativados; a nova rota utiliza `supabaseFetchAdmin` apenas para a RPC específica.
- O front já possuía `resolveUserByEmail()` em `src/services/remoteDriver.js`; portanto não foram necessárias alterações no front.

### Descontinuação do modo tutorial e remoção de artefatos

O modo tutorial/demonstração foi removido do repositório. Os arquivos
`src/tutorial/demoData.auditor.js`, `src/tutorial/demoData.client.js`,
`src/tutorial/demoDriver.js`, `src/tutorial/demoDriverAuditor.js` e
`src/tutorial/tutorialOverlay.js` foram excluídos, pois simulavam
condições de teste que não fazem mais parte do MVP.

Outras mudanças relacionadas:

- **src/main.js** – a lógica que detectava o parâmetro `tutorial` na query
  string e inicializava sessões de demonstração foi removida. O app
  sempre inicializa com hidratação de sessão real.
- **src/actions.js** – removidos os handlers `client-open-tutorial` e
  `auditor-open-tutorial` e comentários associados.
- **partials/client-dashboard.html** e **partials/auditor-dashboard.html** –
  removidos os botões que abriam o modo tutorial.
- **docs/STATUS.md** – atualizado para refletir que a experiência de
  tutorial foi descontinuada.
- **scripts/no_tutorial_term.mjs** – adicionado novo script de CI que
  falha caso a palavra “tutorial” reapareça nos diretórios `src/`,
  `index.html`, `partials/`, `docs/` ou `scripts/` (exceto em
  `docs/CHANGELOG.md`).
- **package.json** – adicionado script `check:tutorial` que é executado
  em `npm run ci` para garantir que não haja regressão.

Essas notas históricas estão aqui apenas para consulta e não fazem
parte do versionamento contínuo. Com a consolidação desta seção, os
arquivos soltos foram removidos da raiz do repositório.