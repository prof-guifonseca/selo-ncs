# Contrato de Front‑end

Este contrato automatizado tem o objetivo de proteger o front‑end da plataforma contra regressões sutis e mitigar a curva de aprendizado para novos mantenedores.  Ele valida aspectos estruturais essenciais que, se quebrados, impedem a navegação ou destroem fluxos críticos.

## Itens cobertos

1. **Views privadas vs. DOM** – O script lê a constante `PRIVATE_VIEWS` do roteador (`src/router.js`) e verifica se cada view privada possui um contêiner correspondente no HTML final (`dist/index.html`) com o identificador `<view>-view`.  Isso impede que uma view protegida seja removida ou renomeada no markup sem atualizar o roteador.
2. **Ações declaradas** – Todos os valores presentes nos atributos `data-action` do HTML são comparados com as chaves declaradas em `__actionsForSmokeTest` (`src/actions.js`).  Dessa forma, ações novas ou renomeadas precisam ser registradas na fachada de actions para que a navegação e os botões funcionem.
3. **Navegação por view** – Cada valor de `data-view` usado para navegação (por exemplo, botões de login ou links do painel) deve ter um contêiner com `id="<view>-view"` no DOM.  Isso evita links quebrados para views inexistentes.
4. **Conteúdo de modais** – As chaves usadas em `data-modal` (ex.: `criteria`, `appeals`) são validadas contra o dicionário de conteúdos de modais (`modalContent` em `src/ui.js`).  Chaves simplificadas que apontam para documentos normativos recebem aliases explícitos no próprio dicionário.  Assim, um modal nunca abrirá sem conteúdo.
5. **IDs críticos** – Uma lista enxuta de IDs (`main-content`, `nav-menu`, `info-modal`, `modal-title`, `modal-body`, `footer-program-title`) é verificada para garantir que elementos estruturais de acessibilidade e inicialização estejam sempre presentes.

## Mitigação de riscos

Este contrato complementa o *smoke test* existente focando na consistência entre código e HTML.  Ao falhar quando uma view, ação, modal ou ID crítico desaparece, ele atua como uma rede de segurança contra mudanças inadvertidas em partials ou no roteador.  Para novos colaboradores, o script documenta de maneira executável quais são os pontos de acoplamento entre o roteador, os handlers de ações e o DOM, reduzindo a necessidade de conhecimento tácito e evitando regressões que só se manifestariam em tempo de execução.
