/**
 * @file src/types/services.js
 * @module types/services
 * @description Tipos (JSDoc) da camada de serviços e contrato do driver de backend (backend-only).
 */


/**
 * Estado mínimo do aplicativo persistido no backend.  Este objeto é
 * serializado como JSON e armazenado por usuário/tenant.  O schema é
 * flexível, mas recomenda-se manter apenas preferências de UI e
 * seleções temporárias sem dados sensíveis.
 *
 * @typedef {Object} AppState
 * @property {('table'|'card'|string)} [viewMode] Define o modo de exibição
 *   preferido (por exemplo, `table` para listagens tabulares ou `card` para
 *   cartões).  Outros valores são permitidos mas podem ser ignorados.
 * @property {Object.<string, any>} [filters] Filtros aplicados nos
 *   dashboards, como parâmetros de busca, pilar ou indicador.
 * @property {Record<string, boolean>} [collapses] Mapeia
 *   identificadores de seções a um booleano indicando se a seção está
 *   colapsada (`true`) ou expandida (`false`).  Útil para manter o
 *   estado de painéis entre navegações.
 * @property {string} [currentAuditorProcessId] Identificador do processo
 *   atualmente selecionado pelo avaliador.  Pode ser omitido quando
 *   nenhum processo estiver em foco.
 */

/**
 * KPIs calculados a partir de indicadores/pareceres.
 *
 * Observação:
 * - Estrutura gerada por uma função `computeKPIs(process)` implementada na UI.
 * - Alguns campos podem variar conforme fase/role.
 *
 * @typedef {Object} ProcessKPIs
 * @property {number} pendentes
 * @property {number} conformes
 * @property {number} pontos
 * @property {Object.<string, any>} scorePorPilar
 * @property {Object.<string, any>} scorePorMaterialidade
 * @property {number} principalScore
 * @property {number} revisorScore
 * @property {number} globalScore
 * @property {Object.<string, any>} scoresByPillar
 * @property {Object.<string, any>} scoresByMateriality
  * @property {number} [scoreTotal] Soma de pontos ponderados obtidos em todas as etapas.  Nem sempre disponível.
  * @property {number} [scoreTotalDecidido] Soma de pontos decididos (pós‑revisão).  Opcional.
  * @property {Object.<string, any>} [scorePorPilarDecidido] Pontuação por pilar já decidida.
  * @property {Object.<string, any>} [statusCounts] Contador de itens por status.  Mapeia status para total.
  * @property {any[]} [gaps] Lista de gaps identificados.  Tipagem flexível pois o formato pode variar.
  * @property {any[]} [gapsAll] Lista completa de gaps (incluindo ocultos ou fora de escopo).
  * @property {boolean} [disparity] Indica se há disparidade significativa entre avaliadores.
  * @property {boolean} [hasCriticalConflict] Indica se existe conflito crítico que bloqueia aprovação.
  * @property {Object.<string, any>} [indicatorScores] Mapeia identificadores de indicadores para suas pontuações.
  * @property {Object.<string, any>} [requiresConsensusById] Mapeia ids de indicadores que exigem consenso para aprovação.
 */

/**
 * Contrato do driver de backend (HTTP) consumido por src/services/api.js.
 * Implementação padrão: src/services/remoteDriver.js.
 *
 * @typedef {Object} ApiDriver
 * @property {(params: {email: string, password: string, role?: ('client'|'auditor'|'admin')}) => Promise<any>} authenticateUser
 * @property {() => Promise<any>} [me]
 * @property {() => Promise<AppState>} loadAppState
 * @property {(appState: AppState) => Promise<{ok: boolean}>} saveAppState
 *
 * @property {(filters?: any) => Promise<import('./core.js').Process[]>} listProcesses
 * @property {(processId: string) => Promise<import('./core.js').Process|null>} getProcessById
 * @property {(processId: string, payload: any) => Promise<{ok: boolean, process?: import('./core.js').Process}>} upsertProcessSubmission
 * @property {(processId: string, triage: import('./core.js').ProcessTriage) => Promise<{ok: boolean}>} updateProcessTriage
 * @property {(processId: string, assignment: import('./core.js').ProcessAssignment) => Promise<{ok: boolean}>} updateProcessAssignment
 * @property {(processId: string, reviews: any) => Promise<{ok: boolean}>} updateProcessReviews
 * @property {(processId: string, decision: import('./core.js').ProcessDecision) => Promise<{ok: boolean}>} updateProcessDecision
 *
 * @property {(filters?: any) => Promise<import('./core.js').EvidenceMeta[]>} listEvidence
 * @property {(payload: any) => Promise<{id: string, upload?: any}>} createEvidenceMeta
 * @property {(evidenceId: string, file: Blob, meta?: any) => Promise<{ok: boolean}>} saveEvidence
 * @property {(evidenceId: string) => Promise<Blob>} getEvidenceFile
 * @property {(evidenceId: string) => Promise<string>} getEvidenceObjectUrl
 * @property {(evidenceId: string) => Promise<{ok: boolean}>} [deleteEvidence]
 *
 * @property {(payload: any) => Promise<string>} [publishPublicPage]
 * @property {(publicIdOrUrl: string) => Promise<void>} [openPublicPage]
 *
 * @property {(token: string) => void} [setToken]
 * @property {() => void} [clearToken]
 */

// Make this file an ES module for TypeScript.  Adding a dummy export
// allows other modules to import './services.js' solely for its type
// definitions without causing the "not a module" error.
export {};
