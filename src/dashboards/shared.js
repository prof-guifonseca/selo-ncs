/**
 * @file src/dashboards/shared.js
 * @module dashboards/shared
 * @description Utilitários compartilhados entre dashboards (render helpers, adaptadores, formatação, etc.).
 */

// src/dashboards/shared.js — funções compartilhadas (cliente/avaliador)
// Extraído de src/dashboard.js


import { addAuditLog } from '../audit.js';
// Pull in UI helpers from the new shared module. These helpers were
// previously defined locally in this module; importing them here ensures
// there is a single canonical implementation in the codebase.
import { $id, clearEl, setText, escapeHtml, cssEscape } from '../shared/ui.js';
import {
  loadAppState,
  saveAppState,
  getAppState,
  createEvidenceMeta,
  saveEvidence,
  getEvidenceFile,
  getEvidenceObjectUrl,
  deleteEvidence,
  // The dashboard no longer consumes indicator and plan mutation helpers from
  // the API facade. These methods were part of an earlier prototype and were
  // removed from `src/services/api.js` during refactoring. To prevent build
  // errors caused by unresolved named imports, they are deliberately omitted
  // here. If indicator or plan updates are needed in the future they should
  // be implemented via `backendAdapter` methods instead of being pulled
  // directly from the API service.
  getProcessById as apiGetProcessById,
} from '../services/api.js';

// Define a minimal store for dashboards. Legacy client‑side storage is not used on
// the dashboards, so the object only carries an empty `state` property to
// satisfy optional references. All data must be fetched from the backend instead.
const dashStore = { state: {} };


/**
 * @module dashboard
 */

/* ========================================================================== */
/* Tipos                                                                      */
/* ========================================================================== */

/**
 * Pilar ESG.
 * @typedef {'E'|'S'|'G'} Pillar
 */

/**
 * Metadados mínimos de uma evidência.
 * @typedef {Object} EvidenceMeta
 * @property {string|number} id
 * @property {Pillar} pillar
 * @property {string} [name]
 * @property {number|null} [size]
 * @property {string} [type]
 */

/**
 * Indicador (shape mínima usada na UI).
 * @typedef {Object} Indicator
 * @property {string|number} id
 * @property {string} [code]
 * @property {string} [name]
 * @property {string} [title]
 * @property {Pillar|string} [pillar]
 * @property {string} [statusFinal]
 * @property {string} [statusPrincipal]
 * @property {string} [statusRevisor]
 * @property {string} [notePrincipal]
 * @property {string} [noteRevisor]
 * @property {boolean} [notApplicable]
 * @property {boolean} [isNotApplicable]
 * @property {Object} [self]
 * @property {string} [updatedAt]
 */

/**
 * Processo de auditoria (shape mínima usada na fila/detalhe).
 * @typedef {Object} AuditProcess
 * @property {string|number} id
 * @property {string} [company]
 * @property {string} [companyName]
 * @property {string} [status]
 * @property {string} [stage]
 * @property {string} [city]
 * @property {string} [sector]
 * @property {string} [dueAt]
 * @property {string} [updatedAt]
 * @property {string} [submittedAt]
 * @property {Object} [assignment]
 * @property {string} [evidenceCount]
 * @property {Array<string|number>} [evidenceIds]
 * @property {Array<Indicator>} [indicators]
 * @property {Array<Object>} [actionPlans]
 */

/* ========================================================================== */
/* Constantes                                                                  */
/* ========================================================================== */

/** @type {Pillar[]} */
const PILLARS = ['E', 'S', 'G'];

/** @type {Pillar[]} */
const PILLAR_ORDER = ['E', 'S', 'G'];

/** @type {Record<Pillar, string>} */
const PILLAR_LABEL = { E: 'Ambiental (E)', S: 'Social (S)', G: 'Governança (G)' };

const TOAST_MS = 4000;
const NOTE_DEBOUNCE_MS = 250;
const CLIENT_SELF_LIMIT = 12;

/* ========================================================================== */
/* Guards globais (idempotência real)                                          */
/* ========================================================================== */

let _storeLoaded = false;
let _storeLoadPromise = null;
let _clientInit = false;
let _auditorInit = false;

// binds “globais” que não dependem de view
let _boundEvidenceActions = false;
let _boundEvidenceUploads = false;

/* ========================================================================== */
/* Utils seguros                                                               */
/* ========================================================================== */

/**
 * Executa um callback de forma segura (não deixa exceções vazarem).
 * @template T
 * @param {(() => T)|any} fn
 * @param  {...any} args
 * @returns {T|undefined}
 */
function safeCall(fn, ...args) {
  try {
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Shortcut para getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
// $id is now imported from '../shared/ui.js'

/**
 * Remove todos os filhos do elemento.
 * @param {HTMLElement|null} el
 */
// clearEl is now imported from '../shared/ui.js'

/**
 * Seta textContent defensivo (nunca joga).
 * @param {HTMLElement|null} el
 * @param {any} value
 */
// setText is now imported from '../shared/ui.js'

/**
 * Escape mínimo para HTML (evita injeção e quebra de marcação).
 * Aceita null/undefined e retorna string vazia nesses casos.
 * Substitui caracteres especiais: & < > " '.
 * @param {any} value
 * @returns {string}
 */
// escapeHtml is now imported from '../shared/ui.js'

/**
 * Renderiza um empty state consistente dentro de um container.
 * @param {HTMLElement|null} container
 * @param {Object} [opts]
 * @param {string} [opts.message]
 * @param {string|null} [opts.ctaLabel]
 * @param {string} [opts.action]
 * @param {Record<string, any>} [opts.dataset]
 * @param {string} [opts.buttonClass]
 */
function renderEmptyState(
  container,
  {
    message = '',
    ctaLabel = 'Ação',
    action = '',
    dataset = {},
    buttonClass = 'btn btn-primary btn-small btn-block',
  } = {}
) {
  if (!container) return;

  // Monta o markup via template strings ao invés de criar elementos
  // imperativos. Garante escape de todo conteúdo interpolado para
  // prevenir injeção XSS e quebras de HTML.
  const escapedMessage = escapeHtml(message);
  let html = `<div class="empty-state"><p class="mb-2">${escapedMessage}</p>`;

  // Só renderiza o botão quando houver label não vazia
  if (ctaLabel) {
    // Constrói atributos do botão: type, classe e data-*
    const escapedClass = escapeHtml(buttonClass);
    const attrs = [`type="button"`, `class="${escapedClass}"`];

    if (action) {
      attrs.push(`data-action="${escapeHtml(action)}"`);
    }

    // Constrói data-* a partir de dataset (ignorando valores nulos ou vazios)
    if (dataset && typeof dataset === 'object') {
      Object.keys(dataset).forEach((k) => {
        const v = dataset[k];
        if (v == null) return;
        const s = String(v);
        if (!s.trim()) return;
        // Converte camelCase em kebab-case, replicando comportamento de dataset
        const attrName = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        attrs.push(`data-${attrName}="${escapeHtml(s)}"`);
      });
    }

    // Texto do botão
    const escapedLabel = escapeHtml(ctaLabel);
    html += `<button ${attrs.join(' ')}>${escapedLabel}</button>`;
  }

  html += '</div>';

  // Substitui o conteúdo do container pelo novo empty state
  container.innerHTML = html;
}

/**
 * CSS.escape robusto (fallback defensivo).
 * @param {any} value
 * @returns {string}
 */
// cssEscape is now imported from '../shared/ui.js'

/**
 * Scroll defensivo para o topo do elemento.
 * @param {HTMLElement|null} el
 */
function safeScrollToTop(el) {
  try {
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // noop
  }
}

/**
 * Formata data ISO (ou similar) em pt-BR.
 * @param {any} iso
 * @returns {string}
 */
function formatDateBr(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString('pt-BR');
  } catch {
    return String(iso || '');
  }
}

/**
 * Garante que o store (via DAL) tenha sido carregado uma vez.
 * Importante: nunca deixa Promise rejeitada “vazar”.
 * @returns {Promise<boolean>}
 */
function loadStoreOnce() {
  // Retorna imediatamente se já está carregado. Em vez de um boolean
  // arbitrário, retorna o snapshot do AppState ou objeto vazio para
  // coerência com hydratação das lojas.
  if (_storeLoaded) {
    const state = getAppState?.();
    return Promise.resolve(state || {});
  }
  if (_storeLoadPromise) return _storeLoadPromise;

  _storeLoadPromise = Promise.resolve()
    .then(() => loadAppState())
    .then((state) => {
      _storeLoaded = true;
      return state || {};
    })
    .catch(() => {
      _storeLoaded = false;
      return {};
    })
    .finally(() => {
      _storeLoadPromise = null;
    });

  return _storeLoadPromise;
}

/**
 * Persiste store sem quebrar fluxo.
 */
function safePersistStore() {
  try {
    const out = saveAppState();
    if (out && typeof out.then === 'function') {
      out.catch(() => {
        // noop
      });
    }
  } catch {
    // noop
  }
}



/* ========================================================================== */
/* Utilitários de UI (debounce/throttle/aria/format)                           */
/* ========================================================================== */

/**
 * Debounce simples (setTimeout), sem dependências.
 * @template {(...args:any[]) => any} F
 * @param {F} fn
 * @param {number} [waitMs]
 * @returns {F & { cancel?: () => void }}
 */
function debounce(fn, waitMs = 250) {
  let t = null;
  const debounced = /** @type {any} */ (function (...args) {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => {
      t = null;
      try {
        fn.apply(this, args);
      } catch {
        // noop
      }
    }, Number(waitMs || 0));
  });

  debounced.cancel = () => {
    if (t) window.clearTimeout(t);
    t = null;
  };

  return debounced;
}

/**
 * Throttle baseado em requestAnimationFrame (1 execução por frame).
 * @template {(...args:any[]) => any} F
 * @param {F} fn
 * @returns {F & { cancel?: () => void }}
 */
function rafThrottle(fn) {
  let rafId = 0;
  let lastArgs = null;
  const throttled = /** @type {any} */ (function (...args) {
    lastArgs = args;
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      const a = lastArgs;
      lastArgs = null;
      try {
        fn.apply(this, a || []);
      } catch {
        // noop
      }
    });
  });

  throttled.cancel = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    lastArgs = null;
  };

  return throttled;
}

/**
 * Marca/desmarca aria-busy.
 * @param {HTMLElement|null} el
 * @param {boolean} busy
 */
function setAriaBusy(el, busy) {
  if (!el) return;
  try {
    el.setAttribute('aria-busy', busy ? 'true' : 'false');
  } catch {
    // noop
  }
}

/**
 * Atualiza um nó para announcements (aria-live).
 * @param {HTMLElement|null} el
 * @param {string} message
 * @param {'polite'|'assertive'} [politeness]
 */
function setAriaLive(el, message, politeness = 'polite') {
  if (!el) return;
  try {
    el.setAttribute('aria-live', politeness);
    // força atualização (alguns leitores ignoram string idêntica)
    el.textContent = '';
    el.textContent = String(message || '');
  } catch {
    // noop
  }
}

/**
 * Formata bytes em unidades humanas.
 * @param {any} bytes
 * @returns {string}
 */
function fmtBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/**
 * Converte um valor de data para o formato de input[type=date] (YYYY-MM-DD).
 * @param {any} value
 * @returns {string}
 */
function toISODateInput(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

/**
 * Faz parse de YYYY-MM-DD (input[type=date]) para ISO string.
 * @param {any} value
 * @returns {string|null}
 */
function parseISODateInput(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  // Interpreta como meia-noite local, compatível com input date.
  try {
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Retorna listas únicas onde indicadores podem existir.
 * Padrão: lista global do store.
 * @returns {Array<Indicator[]>}
 */
function getUniqueIndicatorLists() {
  const lists = [];
  const global = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : null;
  if (global) lists.push(global);
  return lists;
}
/* ========================================================================== */
/* Toast global                                                                */
/* ========================================================================== */

let toastTimer = null;

/**
 * Exibe toast global no container #global-message.
 * @param {string} message
 * @param {'success'|'warn'|'error'} [variant]
 * @param {number} [timeoutMs]
 */
function showToast(message, variant = 'success', timeoutMs = TOAST_MS) {
  const container = $id('global-message');
  if (!container) return;

  container.textContent = String(message || '');
  container.className = 'global-message';
  container.classList.toggle('global-message--success', variant === 'success');
  container.classList.toggle('global-message--warn', variant === 'warn');
  container.classList.toggle('global-message--error', variant === 'error');
  container.style.display = 'block';

  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    container.style.display = 'none';
    container.textContent = '';
  }, timeoutMs);
}

/* ========================================================================== */
/* Helpers de pilares                                                          */
/* ========================================================================== */

/**
 * Normaliza pilar para E/S/G; default G.
 * @param {any} pillar
 * @returns {Pillar}
 */
function normalizePillar(pillar) {
  const p = String(pillar || '').trim().toUpperCase();
  return /** @type {Pillar} */ (PILLAR_ORDER.includes(/** @type {any} */ (p)) ? p : 'G');
}

/**
 * Ordena por pilar (E->S->G) e depois por código/id/nome.
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function sortByPillarThenCode(a, b) {
  const pa = PILLAR_ORDER.indexOf(normalizePillar(a?.pillar));
  const pb = PILLAR_ORDER.indexOf(normalizePillar(b?.pillar));
  if (pa !== pb) return pa - pb;

  const ca = String(a?.code || a?.id || a?.name || a?.title || '');
  const cb = String(b?.code || b?.id || b?.name || b?.title || '');
  return ca.localeCompare(cb, 'pt-BR');
}

/**
 * Adiciona linha divisória por pilar em <tbody>.
 * @param {HTMLTableSectionElement} tbodyEl
 * @param {any} pillar
 * @param {number} colSpan
 */
function appendPillarDividerRow(tbodyEl, pillar, colSpan) {
  const p = normalizePillar(pillar);

  const tr = document.createElement('tr');
  tr.className = 'pillar-divider';
  tr.dataset.pillar = p;

  const th = document.createElement('th');
  th.scope = 'colgroup';
  th.colSpan = colSpan;

  const badge = document.createElement('span');
  badge.className = `pillar-badge pillar-${p}`;
  badge.textContent = p;

  const title = document.createElement('span');
  title.className = 'pillar-title';
  title.textContent = PILLAR_LABEL[p] || p;

  th.appendChild(badge);
  th.appendChild(title);
  tr.appendChild(th);
  tbodyEl.appendChild(tr);
}

/* ========================================================================== */
/* Camada de integração (backend-ready)                                        */
/* ========================================================================== */

/**
 * Carrega um processo por id via DAL (services/api.js).
 * @param {any} processId
 * @returns {Promise<any|null>}
 */
async function getProcessById(processId) {
  const id = String(processId || '').trim();
  if (!id) return null;
  try {
    return await apiGetProcessById(id);
  } catch {
    return null;
  }
}

/**
 * Extrai indicadores de um processo (fallback para store global).
 * @param {any} proc
 * @returns {any[]}
 */
function getIndicatorsForProcess(proc) {
  const p = proc && typeof proc === 'object' ? proc : null;
  const list =
    (p && (p.indicators || p.payload?.indicators || p.data?.indicators)) ||
    (Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : null);
  return Array.isArray(list) ? list : [];
}

/**
 * Extrai planos de ação de um processo (fallback para store global).
 * @param {any} proc
 * @returns {any[]}
 */
function getPlansForProcess(proc) {
  const p = proc && typeof proc === 'object' ? proc : null;
  const list =
    (p && (p.actionPlans || p.plans || p.payload?.actionPlans || p.payload?.plans || p.data?.actionPlans)) ||
    (Array.isArray(dashStore.state?.actionPlans) ? dashStore.state.actionPlans : null);
  return Array.isArray(list) ? list : [];
}

/**
 * Busca metadado de evidência pelo id (store local-first).
 * @param {any} evidenceId
 * @returns {EvidenceMeta|null}
 */
function getEvidenceMetaById(evidenceId) {
  const id = String(evidenceId || '').trim();
  if (!id) return null;
  const list = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  return list.find((e) => String(e?.id) === id) || null;
}

/**
 * Normaliza retorno de addEvidence para um EvidenceMeta.
 * OBS: Mantido por compat/robustez (pode ser útil ao trocar driver), mesmo se não usado hoje.
 * @param {any} out
 * @param {any} pillar
 * @param {any} meta
 * @returns {EvidenceMeta|null}
 */
function normalizeAddEvidenceReturn(out, pillar, meta) {
  // addEvidence pode retornar:
  // - { id, ... }
  // - "id"
  // - null/undefined (erro)
  if (!out) return null;

  if (typeof out === 'string' || typeof out === 'number') {
    const id = String(out);
    const found = getEvidenceMetaById(id);
    return (
      found || {
        id,
        pillar: normalizePillar(pillar),
        name: meta?.name || '',
        size: meta?.size ?? null,
        type: meta?.type || '',
      }
    );
  }

  if (typeof out === 'object' && out.id != null) {
    return out;
  }

  return null;
}

/**
 * Adaptador de backend/IO para o dashboard.
 * - Hoje: usa services/api.js (DAL) com store local-first.
 * - Amanhã: pode trocar por driver remoto mantendo a UI estável.
 *
 * @type {{
 *   loadStoreOnce: () => Promise<void>;
 *   persistStore: () => void;
 *   addEvidence: (pillar: any, meta?: any) => Promise<any>;
 *   saveEvidenceFile: (evidenceId: any, file: File, meta?: any) => Promise<any>;
 *   getEvidenceFile: (evidenceId: any) => Promise<{kind:'url', value:string}|{kind:'blob', value:Blob}|null>;
 *   deleteEvidenceFile: (evidenceId: any) => Promise<any>;
 *   log: (eventName: string, payload?: any) => void;
 *   // Métodos abaixo são “esperados” pelos binds (podem ser implementados pelo projeto):
 *   updateSelfAnswer?: (indicatorId: any, answer: string) => void|Promise<void>;
 *   updateSelfNote?: (indicatorId: any, note: string) => void|Promise<void>;
 *   updateSelfEvidenceIds?: (indicatorId: any, evidenceIds: string[]) => void|Promise<void>;
 *   updateIndicatorStatusRole?: (indicatorId: any, role: string, status: string, reason?: string) => void|Promise<void>;
 *   updateIndicatorNoteRole?: (indicatorId: any, role: string, note: string) => void|Promise<void>;
 * }}
 */
const backendAdapter = {
  // store
  loadStoreOnce: async () => {
    // Garante que o estado esteja carregado via DAL (idempotente, sem rejeição vazando).
    await loadStoreOnce();
  },
  persistStore: () => {
    try {
      const p = saveAppState();
      if (p && typeof p.then === 'function') p.catch(() => {});
    } catch {
      // noop
    }
  },

  // evidence
  addEvidence: async (pillar, meta = {}) => {
    await backendAdapter.loadStoreOnce();
    const ev = await createEvidenceMeta(pillar, meta);
    return ev;
  },
  saveEvidenceFile: async (evidenceId, file, meta = {}) => {
    await backendAdapter.loadStoreOnce();
    return saveEvidence(evidenceId, file, meta);
  },
  getEvidenceFile: async (evidenceId) => {
    await backendAdapter.loadStoreOnce();

    // Preferir ObjectURL (preview)
    try {
      const rec = await getEvidenceObjectUrl(evidenceId);
      if (rec?.url) return { kind: 'url', value: rec.url };
    } catch {
      // noop
    }

    try {
      const fileRec = await getEvidenceFile(evidenceId);
      if (fileRec?.blob instanceof Blob) return { kind: 'blob', value: fileRec.blob };
    } catch {
      // noop
    }

    return null;
  },
  deleteEvidenceFile: async (evidenceId) => {
    await backendAdapter.loadStoreOnce();
    return deleteEvidence(evidenceId);
  },

  // log
  log: (eventName, payload = {}) => addAuditLog(eventName, payload),

  // -------------------------------------------------------------------------
  // Indicator mutations
  //
  // These methods allow the dashboards to persist indicator status and notes
  // through the backend adapter.  The original implementation expected the
  // API service (`src/services/api.js`) to export functions such as
  // `updateIndicatorStatusRole` and `updateIndicatorNoteRole`.  Those
  // functions were removed during refactoring to simplify the data access
  // layer.  Without stubs here the dashboard would throw at runtime when
  // attempting to call into undefined methods.  The implementations below
  // intentionally perform no network requests; instead they resolve
  // immediately.  The UI updates its in-memory state optimistically, and
  // audit events are recorded separately via the `log` helper.  Should a
  // backend API be introduced in the future these methods can be updated to
  // forward the calls accordingly.

  /**
   * Persist an indicator status change for a specific role.  Currently a
   * no-op; returns void.  The caller is responsible for updating local
   * state and emitting audit events.
   *
   * @param {any} indicatorId
   * @param {string} role
   * @param {string} status
   * @param {string} [reason]
   * @returns {Promise<void>}
   */
  updateIndicatorStatusRole: async (indicatorId, role, status, reason = '') => {
    // These arguments are accepted for API completeness but unused.
    void indicatorId;
    void role;
    void status;
    void reason;
    return;
  },

  /**
   * Persist an indicator note change for a specific role.  Currently a
   * no-op; returns void.  The caller is responsible for updating local
   * state and emitting audit events.
   *
   * @param {any} indicatorId
   * @param {string} role
   * @param {string} note
   * @returns {Promise<void>}
   */
  updateIndicatorNoteRole: async (indicatorId, role, note) => {
    void indicatorId;
    void role;
    void note;
    return;
  },
};

/* ========================================================================== */
/* Chat context provider                                                       */
/* ========================================================================== */

/**
 * Sanitiza string (trim + limite).
 * @param {any} value
 * @param {number} [max]
 * @returns {string}
 */
function cleanStr(value, max = 160) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Clamp numérico.
 * @param {any} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

/**
 * Normaliza status textual.
 * @param {any} value
 * @param {string} [fallback]
 * @returns {string}
 */
function normalizeStatus(value, fallback = 'Pendente') {
  const s = cleanStr(value, 32);
  return s || fallback;
}

/**
 * Determina se indicador está marcado como "Não se aplica".
 * @param {any} ind
 * @returns {boolean}
 */
function isNA(ind) {
  if (!ind) return false;
  if (ind.notApplicable === true || ind.isNotApplicable === true) return true;

  const sf = String(ind.statusFinal || '').toLowerCase();
  const sp = String(ind.statusPrincipal || '').toLowerCase();
  const sr = String(ind.statusRevisor || '').toLowerCase();

  return (
    sf.includes('não se aplica') ||
    sp.includes('não se aplica') ||
    sr.includes('não se aplica') ||
    sf.includes('nao se aplica') ||
    sp.includes('nao se aplica') ||
    sr.includes('nao se aplica')
  );
}

/**
 * Determina se indicador está resolvido (considera statusFinal quando existir).
 * @param {any} ind
 * @returns {boolean}
 */
function isResolved(ind) {
  if (!ind) return false;

  const sf = normalizeStatus(ind.statusFinal, '');
  if (sf && sf !== '—' && sf.toLowerCase() !== 'pendente') return true;

  const sp = normalizeStatus(ind.statusPrincipal, 'Pendente');
  const sr = normalizeStatus(ind.statusRevisor, 'Pendente');

  if (sp === 'Pendente' || sr === 'Pendente') return false;
  if (sp === '—' || sr === '—') return false;

  return true;
}

/**
 * Calcula progresso (%) a partir de uma lista de indicadores.
 * @param {any[]} indicators
 * @returns {number}
 */
function computeProgressFromIndicators(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  const total = list.length;
  if (!total) return 0;

  let resolved = 0;
  list.forEach((ind) => {
    if (isNA(ind) || isResolved(ind)) resolved += 1;
  });

  return Math.round((resolved / total) * 100);
}

/**
 * Snapshot de indicadores para contexto do chat (limitado).
 * @param {any[]} indicators
 * @returns {Array<Object>}
 */
function buildIndicatorsSnapshot(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  return list.slice(0, 24).map((ind) => ({
    id: cleanStr(ind.id, 40),
    code: cleanStr(ind.code || ind.id, 40),
    title: cleanStr(ind.title || ind.name, 140),
    pillar: cleanStr(ind.pillar, 8),
    statusFinal: ind.statusFinal == null ? null : cleanStr(ind.statusFinal, 32),
    statusPrincipal: normalizeStatus(ind.statusPrincipal, 'Pendente'),
    statusRevisor: normalizeStatus(ind.statusRevisor, 'Pendente'),
    notApplicable: !!(ind.notApplicable || ind.isNotApplicable),
    isNotApplicable: !!(ind.isNotApplicable || ind.notApplicable),
  }));
}

/**
 * Snapshot de planos de ação para contexto do chat (limitado).
 * @param {any[]} plans
 * @returns {Array<Object>}
 */
function buildPlansSnapshot(plans) {
  const list = Array.isArray(plans) ? plans : [];
  return list.slice(0, 40).map((p) => ({
    id: cleanStr(p.id, 40),
    title: cleanStr(p.title || p.name, 140),
    status: normalizeStatus(p.status, ''),
  }));
}

/**
 * Instala provider global de contexto para chat (cliente).
 * Expõe window.ncsGetChatContext().
 */
function installClientChatContextProvider() {
  safeCall(() => {
    window.ncsGetChatContext = function () {
      const indicators = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
      const plans = Array.isArray(dashStore.state?.actionPlans) ? dashStore.state.actionPlans : [];

      const companyName = cleanStr(state?.session?.company || state?.session?.companyName || '', 120);
      const auditStatus = cleanStr(dashStore.state?.auditStatus || dashStore.state?.status || '', 60);

      const explicitProgress = dashStore.state?.progress;
      const progress =
        typeof explicitProgress === 'number'
          ? clampNumber(explicitProgress, 0, 100)
          : computeProgressFromIndicators(indicators);

      return {
        userRole: 'cliente',
        companyName,
        auditStatus,
        progress,
        indicators: buildIndicatorsSnapshot(indicators),
        actionPlans: buildPlansSnapshot(plans),
      };
    };
  });
}

/**
 * Instala provider global de contexto para chat (avaliador).
 * Expõe:
 * - window.ncsSetAuditorChatProcess(procOrNull)
 * - window.ncsGetChatContext()
 */
function installAuditorChatContextProvider() {
  safeCall(() => {
    window.__ncsAuditorChatProcess = window.__ncsAuditorChatProcess || null;

    window.ncsSetAuditorChatProcess = function (procOrNull) {
      window.__ncsAuditorChatProcess = procOrNull || null;
    };

    window.ncsGetChatContext = function () {
      const proc = window.__ncsAuditorChatProcess;

      if (!proc) {
        const indicators = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
        const plans = Array.isArray(dashStore.state?.actionPlans) ? dashStore.state.actionPlans : [];
        return {
          userRole: 'avaliador',
          companyName: '',
          auditStatus: 'Fila',
          progress: computeProgressFromIndicators(indicators),
          indicators: buildIndicatorsSnapshot(indicators),
          actionPlans: buildPlansSnapshot(plans),
        };
      }

      const procIndicators = Array.isArray(proc.indicators)
        ? proc.indicators
        : Array.isArray(dashStore.state?.indicators)
          ? dashStore.state.indicators
          : [];

      const procPlans = Array.isArray(proc.actionPlans)
        ? proc.actionPlans
        : Array.isArray(dashStore.state?.actionPlans)
          ? dashStore.state.actionPlans
          : [];

      return {
        userRole: 'avaliador',
        processId: cleanStr(proc.id, 60),
        companyName: cleanStr(proc.company || proc.companyName || '', 120),
        auditStatus: cleanStr(proc.status || proc.stage || 'Em análise', 60),
        progress: computeProgressFromIndicators(procIndicators),
        indicators: buildIndicatorsSnapshot(procIndicators),
        actionPlans: buildPlansSnapshot(procPlans),
      };
    };
  });
}

/* ========================================================================== */

/* ========================================================================== */
/* Evidências — lista e ações (compartilhado)                                 */
/* ========================================================================== */

function renderEvidenceList(listEl, items, { emptyText = 'Nenhuma evidência', mode = 'client' } = {}) {
  if (!listEl) return;
  clearEl(listEl);

  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    const id = String(listEl.id || '');
    const match = id.match(/-([ESG])$/);
    const pillar = match ? match[1] : '';

    if (mode === 'auditor') {
      renderEmptyState(listEl, {
        message: 'Nenhuma evidência neste pilar. Confira indicadores e gaps.',
        ctaLabel: 'Ver indicadores',
        action: 'auditor-switch-detail',
        dataset: { section: 'indicators' },
        buttonClass: 'btn btn-secondary btn-small btn-block',
      });
      return;
    }

    // Participante
    if (pillar) {
      // Mostra apenas a mensagem sem botão extra quando não há evidências.
      // O botão "Adicionar evidência" foi removido a pedido do usuário para evitar chamada redundante.
      renderEmptyState(listEl, {
        message: 'Sem evidências neste pilar. Adicione um arquivo para começar.',
        // Define ctaLabel como vazio para suprimir a renderização do botão.
        ctaLabel: '',
      });
      return;
    }

    // Fallback defensivo (não deve acontecer)
    renderEmptyState(listEl, {
      message: emptyText || 'Sem evidências para exibir.',
      ctaLabel: 'Ir para Evidências',
      action: 'client-cta',
      dataset: { cta: 'go-evidence' },
    });
    return;
  }

  // Constrói HTML da lista de evidências com escape defensivo.
  const html = list
    .map((ev) => {
      const name = ev && typeof ev.name !== 'undefined' ? ev.name : 'Evidência';
      const idVal = ev && typeof ev.id !== 'undefined' ? ev.id : '';
      const label = escapeHtml(name);
      const idAttr = escapeHtml(String(idVal ?? ''));
      const btnText = mode === 'auditor' ? 'Veja o documento' : 'Visualizar';
      return `<div class="evidence-item"><span>${label}</span><button type="button" class="btn btn-secondary btn-small" data-id="${idAttr}" data-action="evidence-view">${btnText}</button></div>`;
    })
    .join('');

  listEl.innerHTML = html;
}


function bindEvidenceActionEvents() {
  if (_boundEvidenceActions) return;
  _boundEvidenceActions = true;

  /**
   * Abre evidência (em nova aba) ou baixa como arquivo.
   * @param {any} evidenceId
   * @param {'view'|'download'} [mode]
   */
  async function openEvidence(evidenceId) {
    // Abre a evidência sempre em modo de visualização.  Downloads
    // diretos não são permitidos; qualquer arquivo retornado como Blob
    // será convertido em URL local apenas para exibição.
    const meta = getEvidenceMetaById(evidenceId);
    const file = await backendAdapter.getEvidenceFile(evidenceId);

    if (!file) {
      showToast('Arquivo de evidência indisponível.', 'warn');
      return;
    }

    // file.kind === 'url': URL remota de visualização
    if (file.kind === 'url' && typeof file.value === 'string') {
      try {
        window.open(file.value, '_blank', 'noopener,noreferrer');
        safeCall(() => backendAdapter.log('evidence-view', { evidenceId }));
      } catch {
        showToast('Não foi possível abrir a evidência.', 'error');
      }
      return;
    }

    // file.kind === 'blob': Blob local (de fallback) — abre em nova aba
    if (file.kind === 'blob' && file.value instanceof Blob) {
      const blob = file.value;
      const url = URL.createObjectURL(blob);
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        safeCall(() => backendAdapter.log('evidence-view', { evidenceId }));
      } catch {
        showToast('Não foi possível abrir a evidência.', 'error');
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
      return;
    }

    showToast('Formato de evidência não suportado.', 'warn');
  }

  document.addEventListener('click', (e) => {
    if (e?.defaultPrevented) return;

    const btn = e.target?.closest?.('button[data-action="evidence-download"], button[data-action="evidence-view"]');
    if (!btn) return;

    const evidenceId = btn.dataset.id;
    if (!evidenceId) return;

    e.preventDefault();

    // Apenas visualização é suportada: abre a evidência em nova aba.
    safeCall(() => openEvidence(evidenceId));
  });
}

/* ========================================================================== */
/* Bind — Evidências: upload (delegado, 1x)                                    */
/* ========================================================================== */


/* ========================================================================== */
/* Helpers de formulário                                                      */
/* ========================================================================== */

/**
 * Converte um formulário em um objeto de pares chave/valor.
 *
 * Usa `FormData` para extrair campos e normaliza valores string com trim().
 * Ao definir `opts.multiSelectToArray = true`, campos <select multiple>
 * são convertidos para arrays contendo todos os valores selecionados.
 * Quando `opts.includeUnchecked = true`, campos type="checkbox" não
 * selecionados também são adicionados ao objeto com valor `false`.
 *
 * @param {HTMLFormElement|string|any} formOrId Um elemento <form> ou id do elemento.
 * @param {Object} [opts]
 * @param {boolean} [opts.multiSelectToArray=false] Converte selects múltiplos em arrays.
 * @param {boolean} [opts.includeUnchecked=false] Inclui checkboxes não marcados.
 * @returns {Record<string, any>}
 */
function getFormObject(formOrId, opts = {}) {
  const { multiSelectToArray = false, includeUnchecked = false } = opts || {};
  // Resolve o formulário a partir de id ou elemento.
  let form = null;
  if (formOrId) {
    if (typeof formOrId === 'string') {
      form = document.getElementById(formOrId) || null;
    } else if (formOrId instanceof HTMLFormElement) {
      form = formOrId;
    } else if (formOrId.nodeType === 1) {
      // Pode ser container de formulário; tenta encontrar form ancestral.
      form = formOrId.closest && formOrId.closest('form');
    }
  }
  if (!form || !(form instanceof HTMLFormElement)) return {};

  const out = {};
  const fd = new FormData(form);

  // Se multiSelectToArray, determine nomes de selects múltiplos.
  const multiNames = multiSelectToArray
    ? Array.from(form.elements).reduce((acc, el) => {
        // @ts-ignore
        if (el && el.tagName === 'SELECT' && el.multiple && el.name) {
          acc.add(el.name);
        }
        return acc;
      }, new Set())
    : new Set();

  // Monta entradas, tratando selects múltiplos em arrays e strings com trim.
  for (const [name, value] of fd.entries()) {
    if (!name) continue;
    const val = value instanceof File ? value : String(value).trim();
    if (multiNames.has(name)) {
      if (!Object.prototype.hasOwnProperty.call(out, name)) {
        out[name] = [];
      }
      if (Array.isArray(out[name])) {
        out[name].push(val);
      } else {
        out[name] = [val];
      }
    } else {
      out[name] = val;
    }
  }

  // Inclui checkboxes não marcados quando solicitado.
  if (includeUnchecked) {
    const checkboxes = form.querySelectorAll('input[type="checkbox"][name]');
    checkboxes.forEach((cb) => {
      const n = cb.name;
      if (!n) return;
      if (!Object.prototype.hasOwnProperty.call(out, n)) {
        out[n] = false;
      }
    });
  }
  return out;
}

/**
 * Preenche um formulário com dados fornecidos.
 *
 * Define valores de campos pelo atributo `name` em vez de `id`. Para
 * elementos <select>, seleciona a opção correspondente ao valor. Para
 * <select multiple>, aceita array de valores e marca cada um deles.
 * Para <input type="radio">, marca o botão cujo valor coincide com a
 * propriedade recebida.
 * Outros campos <input> e <textarea> recebem diretamente o valor
 * convertido para string.
 *
 * @param {HTMLFormElement|string|any} formOrId Um elemento <form> ou id do elemento.
 * @param {Record<string, any>} data Objeto contendo pares name/valor para preenchimento.
 */
function fillForm(formOrId, data) {
  if (!data || typeof data !== 'object') return;
  // Resolve formulário a partir de id ou elemento.
  let form = null;
  if (formOrId) {
    if (typeof formOrId === 'string') {
      form = document.getElementById(formOrId) || null;
    } else if (formOrId instanceof HTMLFormElement) {
      form = formOrId;
    } else if (formOrId.nodeType === 1) {
      form = formOrId.closest && formOrId.closest('form');
    }
  }
  if (!form || !(form instanceof HTMLFormElement)) return;

  Object.keys(data).forEach((key) => {
    const val = data[key];
    const escaped = cssEscape(key);
    const nodes = form.querySelectorAll(`[name="${escaped}"]`);
    if (!nodes || nodes.length === 0) return;
    nodes.forEach((el) => {
      const tagName = el.tagName;
      if (tagName === 'SELECT') {
        const selectEl = /** @type {HTMLSelectElement} */ (el);
        if (selectEl.multiple) {
          const arr = Array.isArray(val) ? val.map((v) => String(v)) : [String(val)];
          Array.from(selectEl.options).forEach((opt) => {
            opt.selected = arr.includes(opt.value);
          });
        } else {
          try {
            selectEl.value = val == null ? '' : String(val);
          } catch {
            // noop
          }
        }
      } else if (el instanceof HTMLInputElement) {
        const type = (el.type || '').toLowerCase();
        if (type === 'radio') {
          el.checked = String(val) === el.value;
        } else if (type === 'checkbox') {
          if (typeof val === 'boolean') {
            el.checked = val;
          } else {
            el.checked = String(val) === el.value;
          }
        } else if (type === 'file') {
          // Não é possível programaticamente preencher file inputs.
        } else {
          try {
            el.value = val == null ? '' : String(val);
          } catch {
            // noop
          }
        }
      } else if (el instanceof HTMLTextAreaElement) {
        el.value = val == null ? '' : String(val);
      } else {
        try {
          // Fallback genérico.
          el.value = val == null ? '' : String(val);
        } catch {
          // noop
        }
      }
    });
  });
}

/* ========================================================================== */
/* Data-binding helpers                                                       */
/* ========================================================================== */

/**
 * Safely access a nested property on an object using a dot-separated path.
 * Returns `undefined` if any intermediate segment is nullish.
 *
 * Exemplo: getPath({ a: { b: 2 } }, 'a.b') === 2.
 *
 * @param {any} obj The object to traverse.
 * @param {string} path Dot-separated path (e.g. "a.b.c").
 * @returns {any} The resolved value or undefined.
 */
function getPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  // Split the path on dots and filter out empty segments.
  const parts = path.split('.').filter((p) => p);
  let current = obj;
  for (const key of parts) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Simple text-binding utility. Scans the DOM under `rootElOrId` for elements
 * with a `data-bind` attribute and updates their `textContent` based on the
 * provided data object. Does not modify attributes or innerHTML.
 *
 * The value of `data-bind` should be a dot-separated path into the data
 * object. When the resolved value is undefined or null the text node is
 * cleared.
 *
 * @param {HTMLElement|string|any} rootElOrId A root element or its id.
 * @param {Object} data Source object for bindings.
 */
function bindText(rootElOrId, data) {
  if (!data || typeof data !== 'object') return;
  let root = null;
  if (typeof rootElOrId === 'string') {
    root = document.getElementById(rootElOrId);
  } else if (rootElOrId && rootElOrId.nodeType === 1) {
    root = rootElOrId;
  }
  if (!root) return;
  const nodes = root.querySelectorAll('[data-bind]');
  nodes.forEach((el) => {
    const binding = el.dataset && typeof el.dataset.bind === 'string' ? el.dataset.bind : '';
    const val = binding ? getPath(data, binding) : undefined;
    el.textContent = val == null ? '' : String(val);
  });
}

/* ========================================================================== */
/* Exports                                                                    */
/* ========================================================================== */

export { safeCall, $id, clearEl, setText, renderEmptyState, cssEscape, escapeHtml, safeScrollToTop, formatDateBr, showToast, PILLARS, normalizePillar, sortByPillarThenCode, appendPillarDividerRow, getProcessById, getIndicatorsForProcess, getPlansForProcess, getUniqueIndicatorLists, backendAdapter, cleanStr, clampNumber, normalizeStatus, isNA, isResolved, computeProgressFromIndicators, buildIndicatorsSnapshot, buildPlansSnapshot, getEvidenceMetaById, normalizeAddEvidenceReturn, installClientChatContextProvider, installAuditorChatContextProvider, renderEvidenceList, bindEvidenceActionEvents, debounce, rafThrottle, setAriaBusy, setAriaLive, fmtBytes, toISODateInput, parseISODateInput, safePersistStore, loadStoreOnce, getFormObject, fillForm, getPath, bindText };
