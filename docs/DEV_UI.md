# Guia rápido de UI

Este documento reúne os **padrões de implementação de UI** que devem ser
seguidos nos dashboards do selo NCS.  O objetivo é ser um manual de
**onboarding em 10 minutos** para qualquer pessoa refatorando telas ou
adicionando novos fluxos.  As práticas aqui descritas derivam das
refatorações recentes e são reforçadas pelo código fonte.

## 1. Princípios gerais

### 1.1 Renderizadores puros

- **Funções de renderização retornam strings.** Uma função chamada
  `renderX(item)` deve **somente** concatenar pedaços de HTML e retornar
  uma `string`; ela **não** toca no DOM.  As listas são compostas por
  funções como `renderXList(items)` que iteram e concatenam cada item em
  uma grande string e, ao final, atribuem o resultado ao
  `innerHTML` de um contêiner.  Isso simplifica a escrita de testes
  (basta comparar strings) e reduz a mutação imperativa.

- **Sem acesso global ao DOM dentro do renderer.** Renderizadores puros
  nunca chamam `document.createElement` ou `appendChild` para itens de
  listas.  Para manipulações únicas (por exemplo, mostrar/ocultar
  seções) continue usando seletores e `classList`, mas a estrutura
  principal da lista deve ser montada por template strings.

### 1.2 Escapes obrigatórios

- **Tudo que vem do backend precisa ser escapado.** Use
  `escapeHtml()` antes de interpolar qualquer valor dinâmico em
  templates.  A função centraliza a conversão de caracteres perigosos
  (`&`, `<`, `>`, `"` e `'`) para entidades HTML e aceita valores
  `null`/`undefined` sem lançar erro.  Ela está definida em
  `src/shared/ui.js`【878562962680712†L24-L51】 e não deve ser
  duplicada em outros arquivos.

- **Nunca gere HTML cru com dados de usuário.** Construir tags via
  `innerHTML` sem escape é um vetor trivial de XSS.  Prefira usar
  renderizadores puros + `escapeHtml()` para qualquer conteúdo vindo de
  APIs, metadados ou parâmetros de URL.

### 1.3 Delegação de eventos

- **Use `data-action` e `event delegation`.** Os dashboards já
  implementam um ouvinte global de cliques que inspeciona o atributo
  `data-action` nos elementos.  Adicionar novos botões e ações exige
  apenas definir `data-action="alguma-coisa"` no HTML gerado e
  implementar o respectivo handler em `src/actions.js`.  Isso mantém o
  código desacoplado e evita múltiplos listeners individuais.

## 2. Helpers oficiais e locais de importação

- **`src/shared/ui.js`:** módulo central com helpers gerais.  Ele
  contém `safeStr` (normaliza valores e fornece fallback),
  `escapeHtml`, além de utilitários para seletores (`$id`, `qs`, `qsa`),
  limpeza de elementos (`clearEl`, `setText`) e `cssEscape`.  As
  funções são defensivas por padrão, aceitando entradas nulas ou
  indefinidas【878562962680712†L24-L52】.

- **`src/dashboards/shared.js`:** reexporta as funções do módulo
  anterior e adiciona helpers específicos para dashboards, como
  `bindText`, `getFormObject` e `fillForm`.  Você deve importar
  diretamente destes arquivos em vez de copiar funções entre módulos.

## 3. Formulários

### 3.1 Atributo `name` obrigatório

Para que os helpers consigam ler e preencher um formulário, **todos os
inputs devem ter um atributo `name` único**.  Não utilize apenas `id`;
as funções abaixo operam a partir de `name`.

### 3.2 Leitura e preenchimento via helpers

- **`getFormObject(form, opts)`**: converte um `<form>` em um
  objeto chave/valor.  Usa `FormData` por baixo, normaliza strings com
  `trim()` e permite transformar selects múltiplos em arrays ou incluir
  checkboxes desmarcados【7165844776195†L1162-L1175】.  Passe o id do
  formulário ou o elemento em si.

- **`fillForm(form, data)`**: recebe um objeto com pares
  `name: valor` e popula o formulário correspondente.  Trata
  `<select>` simples e múltiplos, `radio`, `checkbox` e campos de
  texto, convertendo booleans para checkboxes quando necessário
 【7165844776195†L1239-L1315】.  Sempre use esta função para restaurar
  estados após salvar ou recarregar uma página.

## 4. Micro‑binding

Para pequenas atualizações de texto no DOM sem recriar toda a página,
use o **micro‑binding**:

1. Adicione `data-bind="caminho.objeto"` em elementos do HTML
   (gerados por templates ou no markup estático).
2. Chame `bindText(root, vm)` passando o id do contêiner ou o elemento
   raiz e um objeto de dados.  O utilitário percorre todos os nós
   dentro de `root` que possuem `data-bind` e define o
   `textContent` com o valor da propriedade indicada【7165844776195†L1347-L1373】.
   Valores `undefined` ou `null` limpam o texto automaticamente.

`bindText` não altera atributos ou insere HTML; é adequado para textos
curtos como títulos, descrições e labels dinâmicos.  Para listas ou
grandes estruturas, use renderizadores puros descritos na seção 1.

## 5. Renderização única baseada em templates

Os dashboards do selo NCS utilizam **apenas** renderizadores de strings
para montar listas, cards e seções complexas.  Todo o HTML dinâmico é
construído por funções `renderX()` que concatenam pedaços de template e
atribui o resultado ao `innerHTML` de um contêiner.  **Não existe mais um
interruptor de kill‑switch ou fallback para código imperativo** como
acontecia nas primeiras refatorações; a versão baseada em
`document.createElement` foi completamente removida.  Assim, ao
debugar ou estender a UI, concentre‑se nos templates e nos dados
retornados pelo backend.  Este modelo reduz a complexidade do DOM,
simplifica testes automatizados e elimina incoerências entre modos de
renderização.

## 6. Anti‑padrões a evitar

- **Criar elementos em massa com `createElement` para listas ou
  detalhes.** Além de verboso, esse approach dificulta a leitura e
  torna o código suscetível a vazamento de nós.  Prefira montar o HTML
  via template strings e inserir com `innerHTML` no contêiner.

- **Interpolar dados em `innerHTML` sem escape.** Nunca confie em
  strings externas; sempre passe valores por `escapeHtml()` antes de
  concatená-los.

- **Misturar micro‑binding e manipulação direta de `textContent`/`innerHTML`**
  no mesmo bloco de código.  Escolha um padrão para cada seção da
  interface: micro‑binding para textos isolados, renderização pura para
  listas complexas.

Seguindo estas diretrizes você garante consistência visual e segurança
contra XSS e simplifica testes automatizados.