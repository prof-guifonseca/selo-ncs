# Programa NCS — Visão Operacional do MVP

**Data:** 2026-01-06  
Este documento traduz o regulamento e o código do MVP em um manual
operacional.  Ele serve para quem precisa entender rapidamente como
funciona o ciclo do selo NCS no estado atual do repositório, quais
papéis existem e quais são os fluxos implementados.

## Papéis e Perfis

O sistema é multi‑tenant: cada usuário pertence a uma ou mais
empresas (`company_id`) via `ncs_memberships`.  Os papéis são
determinados pelo campo `role` em `ncs_memberships.role` e pelos
claims no JWT (quando RLS está ligado).  O MVP reconhece três
perfis principais:

| Papel (profile) | Funções no código | Permissões no MVP |
|-----------------|-------------------|-------------------|
| **Participante** (cliente) | Cria e edita processos enquanto estiver em estágio inicial.  Usa o front em `/partials/client-dashboard.html`. | Pode listar e abrir seus próprios processos (`GET /api/processes`), subir evidências (`POST /api/evidences` e `presign/commit`), anexar evidências ao processo (`POST /api/processes/:id/evidences`) e acompanhar status.  Não pode editar após submissão (somente complementações mediante solicitação). |
| **Avaliador** (auditor) | Designado para processos via `ncs_process_assignments`.  Usa `/partials/auditor-dashboard.html`. | Pode consultar processos designados ou de sua empresa (`GET /api/processes?stage=…`), adicionar comentários ou notas via `PATCH /api/processes/:id/reviews` e solicitar complementações informais.  Visualiza evidências de processos atribuídos e gera relatórios (`GET /api/report`). |
| **Administrador** (gestor/NCS) | Usuários com `isAdmin=true` no backend.  Usa `/partials/admin-dashboard.html`. | Pode listar e criar processos (`POST /api/processes`), gerenciar empresas (`/api/companies`), memberships (`/api/memberships`) e assignments (`/api/assignments`).  Pode mudar triagem (`PATCH /api/processes/:id/triage`), designar avaliadores (`/assignment`), registrar decisão final (`PATCH /api/processes/:id/decision`) e publicar páginas públicas (`/api/public`). |

Outros perfis, como membros de suporte ou operadores de call center,
podem ser derivados destes papéis básicos com permissões restritas,
mas o MVP ainda não implementa RBAC granular.

## Ciclo do Programa (fluxo de processo)

Cada processo no sistema representa a inscrição de uma empresa no
programa NCS e contém um objeto `payload` com metadados, autoavaliação
e status.  O ciclo é dividido em etapas; o campo `payload.stage` é
usado para persistir o estágio atual.  Abaixo está uma visão da
sequência operacional suportada no código (RLS).

1. **Autoavaliação e submissão inicial**
   - **Criação de processo**: o participante cria um novo processo via
     `POST /api/processes`, que gera um `id` textual (ex.: `proc_123`) e
     um `payload` inicial.  O campo `owner_id` vincula o processo ao
     usuário/empresa.
   - **Autoavaliação**: o front coleta respostas, critérios e
     indicadores.  Esses dados são armazenados no `payload` em campos
     como `indicators` e `evidenceIds`.  As evidências são criadas via
     `POST /api/evidences`, após presign e commit do upload; o ID da
     evidência é incluído no array `evidenceIds` do processo.
   - **Submissão**: quando o participante conclui o dossiê, chama
     `POST /api/processes/submission` com `action="submit"`.  O
     backend atualiza `payload.stage` para `audit` e grava um evento
     de audit trail (`stage_change`).  A partir desse ponto o
     participante não pode mais editar o processo, a menos que
     solicitada complementação.

2. **Triagem de admissibilidade**
   - Um administrador (ou operador) verifica se a submissão atende aos
     requisitos mínimos: questionário preenchido, documentos legíveis,
     porte correto etc.  Essa verificação formal é representada no
     código pela rota `PATCH /api/processes/:id/triage`, onde campos
     específicos como `triage.status` ou `triage.flags` podem ser
     atualizados no `payload`.
   - Se houver pendências, o processo permanece em estágio `audit` mas
     recebe flags adicionais.  O front exibe “Pendente de
     complemento” e solicita que o participante envie correções via
     evidências adicionais; tal fluxo de complementação ainda não está
     totalmente implementado no MVP (ver backlog).

3. **Avaliação independente**
   - A NCS designa um **Avaliador Principal** e um **Avaliador
     Revisor** via `POST /api/assignments` ou `/api/assignments/bulk`.
     Os identificadores do processo e dos auditores são gravados em
     `ncs_process_assignments`.
   - Os auditores acessam o dossiê com `GET /api/processes/:id` e
     examinam as evidências (`GET /api/evidences/:eid/view`).  As
     análises de cada critério são salvas via `PATCH
     /api/processes/:id/reviews`, preenchendo campos em
     `payload.reviews` (livre, por chave).
   - Caso encontrem lacunas, os auditores podem solicitar
     complementação fora de banda.  O regulamento prevê apenas uma
     rodada curta de complementação; o MVP ainda não tem rota própria
     para isso (ver backlog).  O participante anexa novas evidências
     e, quando pronto, o avaliador principal chama `POST
     /api/processes/submission` com `action="approve"` para atualizar
     `payload.stage` para `ready_for_decision`.  A transição de estágio
     é delegada às políticas de RLS no banco; o backend não executa
     validações manuais.

4. **Alinhamento e decisão**
   - Uma vez finalizado o parecer técnico, a NCS conduz uma etapa de
     alinhamento interno (não automatizada) para consolidar a visão do
     avaliador principal e do revisor.  No sistema, a decisão final é
     registrada via `PATCH /api/processes/:id/decision`, gravando
     campos em `payload.decision` (ex.: `status`, `reason`,
     `score`).
   - O backend gera um evento de audit trail (`decision_update`) ao
     persistir a decisão.  A partir daqui o processo está pronto para
     publicação.

5. **Publicação e uso do selo**
   - Administradores podem gerar uma página pública para o processo
     aprovado via `POST /api/public/publish` com `{ process_id }`.  O
     endpoint cria um snapshot no `ncs_public_pages` e retorna um
     `public_id` e uma URL de visualização.  A página é acessível via
     `GET /api/public-pages/:public_id` (admin) ou via rota pública
     `/api/public/preview`.
   - O Selo NCS é então considerado “concedido”.  A empresa pode
     referenciar a página pública como prova de validação.  Não há
     automação para revogação ou renovação; novos ciclos devem ser
     iniciados criando um novo processo.

## Identificadores e Metadados

Para garantir rastreabilidade, o MVP utiliza identificadores
textuais simples:

- **Processo (`id`)**: sempre começa com `proc_` seguido de números ou
  caracteres alfanuméricos.  É gerado pelo backend no momento da
  criação.
- **Evidência (`id`)**: valor UUID gerado pelo Supabase quando um
  registro é inserido em `ncs_evidences`.
- **Página pública (`public_id`)**: slug textual sem prefixo fixo.
- **Usuário (`user.id`)**: string derivada do provedor de auth (email).

Metacampos importantes no `payload` do processo:

- `stage`: estágio atual (`inscricao`, `audit`, `ready_for_decision`,
  `decided`, etc.).  O código usa palavras em inglês para evitar
  colisão com nomes de etapas do regulamento, mas o front traduz
  conforme necessário.
- `ownerId`: id do usuário que criou o processo.
- `evidenceIds`: array de IDs de evidências anexadas.
- `reviews`: objeto com campos arbitrários preenchidos pelos
  avaliadores.
- `decision`: objeto com status final, justificativa e pontuação.

## Privacidade, Multi‑tenant e Auditoria

O regulamento enfatiza a proteção de dados pessoais e a
transparência.  O MVP implementa estas garantias de forma mínima:

- **Isolamento por empresa**: a combinação de cookies HttpOnly com
  políticas RLS impede que usuários acessem processos de outras
  empresas.  Toda validação de tenant é implementada no banco; não
  há fallback em código.
- **Evidências via URL assinada**: uploads são presignados via
  `/api/evidences/:id/presign` e downloads usam `/api/evidences/:id/view` ou
  `/object-url`.  As URLs expiram em 5–10 minutos e não devem ser
  compartilhadas em público.
- **Audit trail**: cada mudança de estágio ou decisão grava um
  evento em `ncs_audit_log` com campos `entity_type`, `entity_id`,
  `action`, `actor_id` e `meta`.  O endpoint `GET /api/audit-log`
  permite consultar a trilha do processo (admin/auditor) com
  paginação e filtros.

## Limitações e Stubs

O MVP foca no fluxo “mínimo confiável”; diversas partes ainda são
stubs ou deixam claro que dependem de implementação futura:

- **Complementações de triagem/avaliação**: o código ainda não possui
  rotas específicas para solicitá-las; a comunicação é feita fora da
  plataforma.  Há stubs nas views com callouts citando o regulamento.
- **IA e chat**: existe uma função `chat.js` no backend, mas ela é
  protótipo e não envia mensagens reais.  O front não integra IA
  sem feature flag.
- **Batch uploads/exports**: as telas permitem listar evidências e
  exportar relatórios, mas não há exportação completa (Excel/PDF) nem
  uploads múltiplos em lote.
- **Renewal e revogação**: renovação do selo e revogação após
  irregularidades não estão codificadas.  Um novo ciclo requer
  iniciar outro processo.

Essas limitações estão mapeadas no backlog interno do projeto. Consulte `docs/DIAGNOSTIC.md` ou as issues do repositório para acompanhar as futuras implementações.