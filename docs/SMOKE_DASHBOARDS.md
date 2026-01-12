# Smoke manual dos dashboards

Este checklist descreve os **fluxos essenciais** a serem exercitados
manualmente após refatorações nos dashboards do selo NCS.  Diferentemente
dos smoke tests automáticos (`scripts/smoke.mjs` e
`scripts/smoke_backend.mjs`), estes cenários verificam que a experiência
de usuário continua funcional após mudanças em renderização de templates,
formulários ou integração com o backend.  Execute-os sempre que
modificar código dos dashboards ou helpers de UI.

## Como usar

1. Faça login na aplicação com um usuário do perfil correspondente
   (cliente, auditor ou administrador).  Use o ambiente de staging se
   disponível.
2. Siga o fluxo descrito para cada dashboard; qualquer erro na
   navegação, carregamento de dados ou preenchimento de formulários deve
   ser registrado.
3. Após cada passo que envolve salvar dados, recarregue a página ou
   retorne à lista para verificar se o estado persiste (isso cobre
   regressões em `fillForm`, `getFormObject` e no backend).

## Cliente (participant/client dashboard)

- **Login e abertura de processo:** faça login como participante e abra
  um processo existente ou inicie um novo.  Certifique‑se de que a
  lista de processos carrega e que as informações básicas (organização,
  etapa, setor) são exibidas.

- **Perfil do participante:** navegue até a aba **Perfil**, preencha
  todas as perguntas do questionário ESG, bem como campos de
  informações básicas.  Use o botão **Salvar**.  Recarregue a página e
  confirme se os dados foram preenchidos corretamente (via `fillForm`).

- **Evidências:** em um indicador qualquer, teste o fluxo de
  evidências: 1) faça upload de um arquivo; 2) visualize o item
  carregado; 3) exclua a evidência.  Verifique se contadores e lists
  são atualizados sem recarregar a página.

## Auditor (reviewer/auditor dashboard)

- **Fila de processos:** como auditor, abra a fila de avaliações.
  Selecione um processo e verifique se os indicadores são listados.

- **Detalhe e notas:** navegue pelos indicadores usando as setas ou o
  menu lateral.  Para cada indicador selecione uma resposta, adicione
  notas ou justificativas e confirme com **Salvar rascunho** ou
  **Registrar decisão** (caso disponível).  Após registrar, volte
  para a fila e certifique‑se de que o status do processo foi
  atualizado.

- **Perfil/questionário:** dentro do detalhe do processo, localize a
  visualização do perfil/questionário do participante.  Verifique se
  todos os campos respondidos pelo participante são exibidos e
  formatados corretamente.

## Administrador (manager/admin dashboard)

- **Lista de operações:** logado como gestor, abra a lista de
  operações (processos).  Escolha um item e entre no detalhe.
  Execute as principais ações disponíveis: definir triagem, atribuir
  avaliadores, alterar status ou movimentar o processo para a próxima
  etapa.  Após cada ação, volte à lista e confira se o estado foi
  persistido.

- **Lista de NCS:** navegue até a lista de **Não Conformidades (NCS)**.
  Abra um detalhe e utilize as opções para **Registrar decisão**,
  **Solicitar alinhamento** ou **Devolver para a operação**.  Verifique
  se mensagens de sucesso aparecem e se os campos obrigatórios
  (justificativas, prazos) são validados.

## Observações

- **Atenção aos anúncios (announcers)**: todos os dashboards possuem um
  elemento invisível usado para anunciar mensagens de carregamento ou
  erro para leitores de tela.  Ao simular falhas de rede ou estados
  vazios, confirme que essas mensagens são preenchidas e limpas
  corretamente.

 - **Renderização consistente:** os dashboards utilizam sempre a
  renderização baseada em templates (strings HTML) e não possuem mais
  um kill‑switch para alternar entre modos. Ao depurar problemas,
  concentre‑se nos templates e nos dados retornados pelo backend; não há
  fallback para código imperativo legado.