/**
 * @file src/profileQuestions.js
 * @module profileQuestions
 *
 * Catálogo de perguntas de perfil ESG (versão 1). Este módulo exporta
 * um array estático contendo os metadados das perguntas apresentadas
 * durante o onboarding de participantes. As definições originais
 * residiam dentro de `src/dashboards/client.js`, mas foram extraídas
 * para um módulo dedicado para compartilhamento entre o dashboard do
 * participante e o dashboard do avaliador. Caso novas versões do
 * questionário sejam introduzidas, exporte constantes adicionais ou
 * providencie mecanismos de versionamento conforme necessário.
 *
 * Cada entrada inclui:
 *  - `id`: código único da pergunta (ex.: 'G1').
 *  - `pillar`: pilar ESG associado (E, S ou G).
 *  - `text`: enunciado da pergunta em português.
 *  - `opts`: lista de opções válidas (normalizadas em inglês). As
 *    opções possíveis são 'yes', 'no', 'partial' e 'na'.
 *  - `required`: indica se a pergunta é obrigatória no onboarding.
 */

export const PROFILE_QUESTIONS_V1 = [
  { id: 'G1', pillar: 'G', text: 'Há responsável definido por ESG/compliance?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G2', pillar: 'G', text: 'Existe código de conduta/política ética formal?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G3', pillar: 'G', text: 'Existe canal de denúncias/relato de irregularidades?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G4', pillar: 'G', text: 'Existe política anticorrupção/anti-suborno aplicável?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G5', pillar: 'G', text: 'Existe política LGPD + procedimento para incidentes?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G6', pillar: 'G', text: 'Há critérios mínimos para fornecedores críticos (legalidade, trabalho infantil etc.)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'G7', pillar: 'G', text: 'Há mapeamento básico de riscos (operacionais/ESG) ao menos anual?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E1', pillar: 'E', text: 'O consumo de energia é monitorado (conta/medição) e revisado?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E2', pillar: 'E', text: 'O consumo de água é monitorado?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E3', pillar: 'E', text: 'Resíduos são segregados e destinados corretamente?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E4', pillar: 'E', text: 'Licenças/regularidades ambientais estão em dia (quando aplicável)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E5', pillar: 'E', text: 'E-lixo/óleo/químicos têm destinação controlada (quando aplicável)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'E6', pillar: 'E', text: 'Existem ações/metas simples de redução de desperdício/consumo?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S1', pillar: 'S', text: 'SST: há registros de EPI/treinamentos/rotina de segurança?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S2', pillar: 'S', text: 'Integração/treinamento de segurança para novos integrantes existe?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S3', pillar: 'S', text: 'Há política contra discriminação/assédio (mesmo que simples)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S4', pillar: 'S', text: 'Jornada/pagamentos são controlados formalmente conforme lei?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S5', pillar: 'S', text: 'Existe canal de atendimento e registro de reclamações de clientes?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S6', pillar: 'S', text: 'Existe ação/engajamento com comunidade local (quando aplicável)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S7', pillar: 'S', text: 'Há ações de capacitação/treinamento anual (mesmo que básicas)?', opts: ['yes', 'no', 'partial', 'na'], required: true },
  { id: 'S8', pillar: 'S', text: 'Há prática mínima de privacidade e segurança da informação no dia a dia?', opts: ['yes', 'no', 'partial', 'na'], required: true },
];

export default PROFILE_QUESTIONS_V1;