# Guia de Contribuição para o Front‑end

Este documento complementa o manual (`FRONTEND_HANDBOOK.md`) com regras objetivas para quem
contribui com o front‑end do selo NCS.  Ele cobre as convenções de HTML/JS
necessárias para manter o SPA estável, orienta como rodar os *gates* locais e
explica o procedimento para adicionar novas views sem quebrar contratos.

## Regras de partials, `data‑action` e IDs de view

- **Partials** – todo markup de uma página vive em um arquivo dentro de
  `partials/`.  Cada partial contém um contêiner `<div>` com `id="nome-view"` e
  classe `view`.  O script de build injeta esses parciais em `index.html`.
  Evite escrever HTML dinâmico fora de partials; lógica pertence aos
  renderizadores JS.

- **IDs de view** – siga o padrão `<nome>-view` (ex.: `landing-view`,
  `client-dashboard-view`).  O roteador (`src/router.js`) remove o sufixo
  `-view` para derivar o nome da rota.  Alterar ou omitir o sufixo quebra a
  navegação.

- **Marcadores `data-action`** – botões e links interativos devem declarar
  `data-action="alguma-coisa"`.  O dispatcher em `src/actions.js` inspeciona esse
  atributo e dispara o handler correspondente.  Adicionar uma ação nova
  consiste em criar um elemento com o atributo e implementar o caso no módulo
  de ações; não crie listeners diretos no DOM.

- **Blocos e seções** – use classes ou atributos `data-view` para marcar
  seções internas que devem ser mostradas ou escondidas conforme a navegação.
  Anchors internas são acessadas via parâmetros de consulta (por exemplo,
  `/dashboard/admin?anchor=configuracoes`) e o roteador faz o *scroll* suave
  até o elemento com o `id` informado.

- **Hooks de marca (white‑label)** – componentes que exibem nomes, logos ou
  links institucionais devem utilizar os IDs estáveis definidos em
  `src/brand.js` (`navbar-logo-ncs`, `navbar-program-name`, `footer-program-title`,
  etc.).  O loader de marca aplica o conteúdo correto em tempo de execução.
  Não acople marcas diretamente no HTML.

## Rodando o kit de *gates* localmente

Antes de abrir um pull request, rode a sequência de verificações locais para
garantir que sua mudança não introduz regressões:

1. **CI local** – execute `npm run ci`.  Este comando dispara o build,
   smoke tests de HTML/CSS, uma verificação de que termos proibidos
   (palavras previamente removidas do front e da documentação) não foram
   reintroduzidos, além dos testes de contrato do backend e validações
   mínimas do front.
   Ele também roda o script `check:docs`, que falha se documentos críticos
   estiverem ausentes.

2. **E2E automatizado** – instale dependências do navegador com
   `npm run e2e:install` (apenas na primeira vez) e rode `npm run e2e`.
   A suíte de Playwright cobre a navegação pública, a transição para login
   e a troca de abas no painel do avaliador.  Qualquer falha indica
   regressão de usabilidade ou acessibilidade.

3. **Testes de contrato opcionais** – se estiver alterando o backend ou
   integrando APIs externas, você pode rodar os contratos em modo vivo com
   `CONTRACT_BACKEND_LIVE=1 npm run contract` (requer configuração de
   variáveis de ambiente e credenciais).  Em geral, os contratos são
   disparados automaticamente pelo CI.

Seguir esse fluxo minimiza o risco de merges quebrados e reduz o tempo de
revisão.

## Como adicionar uma nova view

Para criar uma nova página ou aba dentro do SPA sem quebrar contratos:

1. **Crie o partial** – adicione um arquivo HTML em `partials/` contendo um
   `<div>` com `id="nova-view"` e classe `view`.  Coloque dentro desse
   contêiner apenas markup estático (inputs, placeholders, etc.).

2. **Implemente a lógica** – se a view for um dashboard (cliente, auditor ou
   admin), crie um módulo em `src/dashboards/` exportando uma função
   `initNovaView()` responsável por bindar eventos, buscar dados do backend e
   renderizar listas via helpers (`renderX()`).  Se a view for simples,
   implemente o handler diretamente em `src/actions.js`.

3. **Atualize o roteador** – adicione uma entrada em `src/router.js` mapeando
   o caminho (`/dashboard/nova` ou similar) para a view.  Garanta que
   restrições de papel (`getRole()`) e guarda de sessão sejam aplicadas
   conforme necessário.

4. **Atualize documentação** – descreva a nova rota em `docs/ROUTE_MAP.md` e
   registre a mudança em `docs/CHANGELOG.md`.  Mantenha o manual de front
   atualizado caso introduza um novo padrão.

5. **Execute os *gates*** – rode `npm run ci`, `npm run e2e` e revise
   manualmente o fluxo descrito em `docs/SMOKE_DASHBOARDS.md` para garantir
   que a view não cause regressões.

Seguindo estes passos você garante que a adição de uma nova view está de
acordo com o contrato existente, não quebra o roteador e mantém a
documentação alinhada.