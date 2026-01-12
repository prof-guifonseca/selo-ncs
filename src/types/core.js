/**
 * @file src/types/core.js
 * @description Definições de tipos centrais (JSDoc) para o projeto NCS.
 * Serve como fonte de verdade para estruturas de dados compartilhadas.
 */

/**
 * Identificador único universal (UUID ou hash curto).
 * @typedef {string} Id
 */

/**
 * Data em formato ISO 8601 (ex: '2025-12-31T10:00:00.000Z').
 * @typedef {string} ISODateString
 */

/**
 * Papéis de usuário no sistema.
 * @typedef {'client'|'auditor'|'admin'} Role
 */

/**
 * Status possível de um indicador.
 * @typedef {'Pendente'|'Validado'|'Condicionante'|'Negado'|'Não se aplica'} StatusLabel
 */

/**
 * Pilares ESG.
 * @typedef {'E'|'S'|'G'} Pillar
 */

/* ==========================================================================
   Entidades de Catálogo (Estáticas)
   ========================================================================== */

/**
 * Representa a definição estática de um indicador no catálogo.
 * @typedef {Object} IndicatorMeta
 * @property {number} id - ID numérico canônico (1 a 12).
 * @property {Pillar} pillar - Pilar ESG.
 * @property {string} category - Categoria macro.
 * @property {string} categoryLabel - Rótulo de exibição da categoria.
 * @property {string} theme - Tema específico.
 * @property {string} title - Título do indicador.
 * @property {string} question - Pergunta orientadora.
 * @property {string} tooltip - Texto de ajuda.
 * @property {Object} [scoring] - Regras de pontuação.
 * @property {Object} [evidence] - Regras de evidência (formatos, requisitos).
 * @property {Object} [references] - Referências externas (ODS, GRI, etc.).
 */

/* ==========================================================================
   Entidades de Estado (Dinâmicas)
   ========================================================================== */

/**
 * Representa o estado de um indicador dentro de um processo de avaliação.
 * @typedef {Object} IndicatorState
 * @property {number} id - ID numérico (vinculado ao catálogo).
 * @property {string} title - Título (copiado do catálogo para facilitar).
 * @property {StatusLabel} statusPrincipal - Status atribuído pelo Avaliador Principal.
 * @property {StatusLabel} statusRevisor - Status atribuído pelo Avaliador Revisor.
 * @property {StatusLabel|null} statusFinal - Status de consenso ou decisão final.
 * @property {string} [notePrincipal] - Comentários do Principal.
 * @property {string} [noteRevisor] - Comentários do Revisor.
 * @property {string} [noteFinal] - Comentários da decisão final.
 * @property {boolean} [notApplicable] - Flag legado de não aplicabilidade.
 * @property {string} [notApplicableReason] - Justificativa de não aplicabilidade.
 */

/**
 * Metadados de um arquivo de evidência.
 * @typedef {Object} EvidenceMeta
 * @property {Id} id - ID único da evidência.
 * @property {string} name - Nome original do arquivo.
 * @property {string} type - Mime type (ex: 'application/pdf').
 * @property {number} size - Tamanho em bytes.
 * @property {ISODateString} date - Data de upload.
 * @property {Pillar} [pillar] - Pilar associado.
 * @property {number|null} [indicatorId] - ID do indicador associado.
 * @property {string} [ownerId] - ID do usuário que enviou.
 */

/**
 * Estrutura de Triagem Formal (Admissibilidade).
 * @typedef {Object} ProcessTriage
 * @property {'PENDENTE'|'OK'|'NEEDS_FIXES'} status
 * @property {string} notes - Observações da triagem.
 * @property {ISODateString|null} updatedAt
 * @property {string|null} updatedBy
 */

/**
 * Estrutura de Designação de Avaliadores.
 * @typedef {Object} ProcessAssignment
 * @property {string|null} principalEmail
 * @property {string|null} reviewerEmail
 * @property {ISODateString|null} assignedAt
 * @property {string|null} assignedBy
 */

/**
 * Estrutura de Decisão Final da NCS.
 * @typedef {Object} ProcessDecision
 * @property {'validado'|'validado_condicionantes'|'negado'|null} outcome
 * @property {ISODateString|null} decidedAt
 * @property {string|null} decidedBy
 * @property {string|null} [ratifiedBy]
 * @property {string} [rationale]
 * @property {boolean} [diverged]
 */

/**
 * Representa um Processo de Verificação completo.
 * @typedef {Object} Process
 * @property {Id} id
 * @property {string} company - Razão social.
 * @property {string} status - Status "humano" (ex: 'Em análise', 'Validado').
 * @property {string} stage - Etapa do fluxo (ex: 'Triagem', 'Decisão NCS').
 * @property {string} [city]
 * @property {string} [sector]
 * @property {ISODateString} submittedAt
 * @property {ISODateString} updatedAt
 * @property {ISODateString} dueAt - Prazo SLA.
 * @property {string[]} evidenceIds - Lista de IDs de evidências vinculadas.
 * @property {Object} [declarations] - Declarações de aceite (termos, veracidade).
 * @property {ProcessTriage} [triage] - Dados da triagem.
 * @property {ProcessAssignment} [assignment] - Dados de alocação.
 * @property {Object} [reviews] - Pareceres técnicos (principal/revisor).
 * @property {ProcessDecision} [decision] - Decisão final.
 */

// Make this file an ES module for TypeScript.  Without an explicit export
// statement, TypeScript treats this file as a script and refuses
// `import('./core.js')` in JSDoc annotations.  A dummy export
// preserves the existing runtime behaviour while enabling type imports.
export {};

/**
 * @typedef {Object} Session
 * @property {boolean} isLoggedIn
 * @property {Role} role
 * @property {string} email
 * @property {string} [company] Alias legado (nome da empresa).
 * @property {string} [companyName] Nome da empresa/organização.
 * @property {string} [companyId] ID da empresa/organização.
 * @property {string} [userId]
 * @property {string} [accessToken] Token de acesso (JWT) fornecido pelo backend.
 * @property {string} [token] Alias legado de accessToken (deprecated).
 * @property {string} [city] Localidade associada ao processo ou usuário.
 * @property {string} [sector] Setor econômico associado ao processo ou usuário.
 */
