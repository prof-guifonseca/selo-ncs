# Manual de Front-end

Este manual é um guia prático de onboarding para desenvolver ou modificar a
interface web do selo NCS. Em cerca de 20 minutos você entende como o SPA
funciona, quais padrões de HTML e JavaScript devem ser seguidos, o que
revisar em um pull request e como depurar rapidamente.

## 1. Como o front funciona (em 2 min)

- **SPA com History API:** a aplicação é uma *single‑page application* que
  usa o caminho (`pathname`) e a *query string* (`search`) da URL para
  navegar entre seções. O roteador (`src/router.js`) lê o caminho
  normalizado e os parâmetros de consulta, resolve a rota e ativa a
  view correspondente. Links legados com hash (`#view` ou `#view/ancora`)
  são automaticamente convertidos para o novo formato durante um período
  de transição. Views privadas exigem sessão e papel; o roteador
  redireciona para `login` quando necessário.
- **Views são elementos com `.view`:** cada página é um contêiner
  `<div id="algo-view" class="view">` nos partials. Apenas uma view fica
  com a classe `active` por vez; mudar a classe mostra/oculta a view.
- **Init idempotente:** funções como `initRouter()` e inicializadores de
  dashboards usam `installOnce()` para que eventos e efeitos sejam
  instalados apenas uma vez. Você pode chamá‑las repetidamente sem
  duplicar listeners.
- **Renderização por string:** listas, cards e seções dinâmicas são
  montadas por funções `renderX()` que retornam uma string de HTML e
  atualizam `innerHTML` de um contêiner. Nunca manipulamos listas com
  `createElement` em loop.
- **Delegação de eventos:** um único listener em `body` inspeciona
  `data-action` e despacha para o handler em `src/actions.js`. Adicionar
  uma ação nova envolve apenas definir `data-action="nova-acao"` no HTML
  e implementar o caso no arquivo de ações.

## 2. Convenções de HTML

- **IDs de views:** use o padrão `<div id="nome-view" class="view">`
  (ex.: `landing-view`, `client-dashboard-view`). O roteador normaliza
  nomes de view removendo o sufixo `-view`.
- **Marcadores de ações:** para botões e links que disparam lógica use
  `data-action="alguma-coisa"`. O valor será usado pelo dispatcher em
  `src/actions.js`.
- **Marcadores de view ou seção:** para navegação interna você pode usar
  atributos `data-view="destino"` (interpretados pelo roteador) ou fornecer
  um `href` que corresponda ao caminho, como `/login` ou `/dashboard/client`. Para seções específicas dentro de uma view, use parâmetros de consulta (por exemplo, `/?section=ncs` para a landing ou `/dashboard/admin?anchor=configuracoes`).
- **IDs críticos e âncoras:** se uma seção de uma view precisa ser
  acessada via âncora, atribua `id="alguma-ancora"` ao
  elemento e utilize um parâmetro de consulta (`?section=algo` ou `?anchor=algo`) no link. O roteador fará scroll suave até essa âncora quando a view for renderizada.
- **Atributos de acessibilidade:** associe elementos interativos a painéis
  com `aria-controls` e mantenha `aria-label` descritivo. O front não
  injeta estes atributos automaticamente.
- **Templates/partials:** todos os fragmentos de HTML residem em
  `/partials`. O script `build.js` injeta os partials em `index.html`.
  Mantenha o markup estático o mais simples possível; lógica e loops
  pertencem aos renderizadores JS.

## 3. Convenções de JavaScript

- **Estado centralizado:** o estado da sessão, papel do usuário e view
  atual ficam em `src/state.js`. Evite criar variáveis globais ou estados
  flutuantes em módulos isolados. Dados persistentes devem vir do
  backend e ser repassados aos renderizadores.
- **Helpers puros:** funções que montam HTML (ex.: `renderEvidenceCard(e)`)
  devem ser *puras* — apenas concatenam strings e escapam valores via
  `escapeHtml()` e nunca consultam o DOM. Isso facilita testes e
  previne XSS.
- **Onde nunca colocar estado:** não armazene dados em atributos DOM
  (`element.dataset.foo`) esperando que persistam entre renders. Use
  `state.js` ou reconsulte a API quando necessário.
- **Padrão de helpers:** reutilize utilitários em `src/shared/ui.js`
  (`escapeHtml`, `$id`, `qs`, etc.) e em `src/dashboards/shared.js`
  (`getFormObject`, `fillForm`, `bindText`). Não copie funções entre
  módulos.
- **Adicionando uma nova view/aba:** crie um novo partial em
  `/partials` com id `nova-view`. Importe e inicialize a lógica em
  `src/dashboards` ou `src/actions.js`. Atualize o roteador somente se a
  view for privada ou se precisar de redirecionamento por papel.

## 4. Checklist de PR do front

1. O novo código segue o padrão de renderização por string e utiliza
   `escapeHtml()` para dados dinâmicos?
2. Todos os botões/links usam `data-action` e têm handlers em
   `src/actions.js` ou no módulo apropriado?
3. Os formulários usam `name` em todos os inputs e são lidos/preenchidos
   via `getFormObject` e `fillForm`?
4. Há reutilização de helpers de `src/shared/ui.js` ou
   `src/dashboards/shared.js` em vez de código duplicado?
5. Novas views ou seções foram adicionadas em `/partials` e possuem id
   `...-view` e classe `view`?
6. O roteador e o estado (`src/router.js`, `src/state.js`) permanecem
   idempotentes e sem efeitos colaterais?
7. O código evita armazenar estado em elementos DOM ou variáveis globais?
8. Foi rodado `npm run smoke` e `npm run smoke:backend` sem falhas, e
   os fluxos críticos passaram manualmente?
9. A documentação está atualizada (`docs/API.md`, `docs/CHANGELOG.md`, etc.)
   quando endpoints ou fluxos foram alterados?
10. O CI (`npm run ci`) passa localmente, incluindo `npm run check:docs`
    sem arquivos faltando?

## 5. Debug rápido

- **Reproduzir um bug:** identifique a rota (por exemplo, `/login` ou `/dashboard/client`, ou parâmetros como `/?section=ncs`) e o papel do
  usuário. Navegue até essa view e use dados de teste de
  `docs/SMOKE_DASHBOARDS.md` para reproduzir a sequência.
- **Verifique o estado e a URL:** use o console
  (`state.currentView`, `window.location.pathname`, `window.location.search`) para garantir que o
  roteador está no estado esperado.
- **Inspecione eventos:** adicione `console.log` temporários nos
  handlers em `src/actions.js` ou `src/dashboards/*.js` para verificar se
  o `data-action` é disparado corretamente.
- **Network & API:** abra a aba Network e confirme as chamadas a `/api`
  e a Supabase; erros 4xx/5xx geralmente indicam payloads incorretos ou
  falta de permissão.
- **Smoke tests manuais:** execute os passos em
  `docs/SMOKE_DASHBOARDS.md` para cobrir fluxos de cliente, auditor e
  gestor. Esses testes rápidos pegam regressões mais comuns.
- **Logs do backend:** para erros de API, verifique a função
  correspondente em `netlify/functions/api/` e, se necessário, adicione
  prints temporários ou consulte os logs da Netlify para mais contexto.

---

Seguindo este handbook, qualquer pessoa poderá adicionar ou modificar
telas com segurança e consistência, mantendo o front do selo NCS
robusto e previsível.
