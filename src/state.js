/**
 * @file src/state.js
 * @module state
 * @description Estado global mínimo do front (SPA) — **apenas em memória**.
 *
 * Regras (HARD CUT):
 * - Sem localStorage / sessionStorage / IndexedDB.
 * - Sessão é mantida em RAM e serve para UX/guards do router.
 * - Auth cookie-first: o backend mantém sessão via cookie HttpOnly.
 * - O driver pode manter metadados não sensíveis em globalThis.__NCS_AUTH (best-effort).
 *
 * Exporta:
 * - state: objeto mutável com { session, currentView }
 * - saveSession/getSession/clearSession
 * - isLoggedIn/getRole
 * - setCurrentView
 * - helpers: getClientKPIs, deriveUserIdFromEmail
 */

/**
 * @typedef {Object} SessionState
 * @property {boolean} [isLoggedIn]
 * @property {('client'|'auditor'|'admin'|string)} [role]
 * @property {string} [email]
 * @property {string} [company]
 * @property {string} [cnpj]
 * @property {string} [userId]
 * @property {string} [city] Localidade associada (opcional).
 * @property {string} [sector] Setor econômico (opcional).
 * @property {string[]|null} [roles]
 * @property {number|null} [expiresAt]
 * @property {string|null} [currentAuditorProcessId]
 *
 * // Campos legados (não devem ser necessários em cookie-first, mas mantidos por compat):
 * @property {string} [accessToken]
 * @property {string} [tokenType]
 */

/**
 * Estado global (mutável) em memória.
 * @type {{ session: SessionState, currentView: string }}
 */
export const state = {
  session: {
    isLoggedIn: false,
    role: '',
    roles: null,
    email: '',
    company: '',
    cnpj: '',
    userId: '',
    expiresAt: null,
    currentAuditorProcessId: null,

    // legados (compat)
    accessToken: '',
    tokenType: 'bearer',
  },
  currentView: 'landing',
};

/* ========================================================================== */
/* Utils                                                                      */
/* ========================================================================== */

/**
 * @param {any} v
 * @returns {string}
 */
function safeStr(v) {
  try {
    return String(v == null ? '' : v).trim();
  } catch {
    return '';
  }
}

/**
 * @param {any} v
 * @returns {string[]}
 */
function safeStringArray(v) {
  if (Array.isArray(v)) return v.map((x) => safeStr(x)).filter(Boolean);
  return [];
}

/**
 * Normaliza role para valores esperados quando possível.
 * Aceita string/array/obj e tenta extrair o role "primário".
 *
 * @param {any} input
 * @returns {'client'|'auditor'|'admin'|''}
 */
function normalizeRole(input) {
  const s = safeStr(input).toLowerCase();
  if (s === 'client' || s === 'auditor' || s === 'admin') return /** @type {any} */ (s);

  const arr = safeStringArray(input).map((x) => x.toLowerCase());
  for (const r of arr) {
    if (r === 'admin') return 'admin';
    if (r === 'auditor') return 'auditor';
    if (r === 'client') return 'client';
  }

  if (input && typeof input === 'object') {
    const candidates = [
      input.role,
      input.primaryRole,
      input.currentRole,
      input.name,
      input.type,
      input.user_role,
      input.userRole,
    ];

    for (const c of candidates) {
      const nr = normalizeRole(c);
      if (nr) return nr;
    }

    const fromRoles = normalizeRole(input.roles);
    if (fromRoles) return fromRoles;
  }

  return '';
}

/**
 * Lê metadados best-effort do driver, quando existirem.
 * @returns {{ ok: boolean, role: string, roles: string[]|null, email: string }}
 */
function readGlobalAuthMeta() {
  try {
    const a = globalThis.__NCS_AUTH || {};
    const ok = Boolean(a?.ok);
    const role = safeStr(a?.role);
    const roles = Array.isArray(a?.roles) ? a.roles.map((x) => safeStr(x)).filter(Boolean) : null;
    const email = safeStr(a?.email).toLowerCase();
    return { ok, role, roles, email };
  } catch {
    return { ok: false, role: '', roles: null, email: '' };
  }
}

/**
 * Emite evento de sessão (router escuta em window).
 * Mantém evento legado em document para compat.
 */
function emitSessionChanged() {
  const detail = { session: state.session };

  try {
    window.dispatchEvent(new CustomEvent('ncs:session:changed', { detail }));
    window.dispatchEvent(new CustomEvent('ncs:auth:changed', { detail })); // compat
  } catch {
    // noop
  }

  try {
    document.dispatchEvent(new CustomEvent('session:changed', { detail })); // legado
  } catch {
    // noop
  }
}

/* ========================================================================== */
/* API: sessão                                                                 */
/* ========================================================================== */

/**
 * @returns {SessionState}
 */
export function getSession() {
  return state.session;
}

/**
 * Atualiza a sessão em memória (cookie-first).
 *
 * @param {Partial<SessionState>} patch
 * @returns {SessionState}
 */
export function saveSession(patch = {}) {
  const next = { ...(state.session || {}) };

  // roles / role
  if ('roles' in patch) {
    const arr = safeStringArray(patch.roles);
    next.roles = arr.length ? arr : null;
  }

  if ('role' in patch) {
    const nr = normalizeRole(patch.role);
    next.role = nr || safeStr(patch.role);
  } else if (patch && typeof patch === 'object' && 'user' in patch) {
    // tolera payloads do tipo { user: {...} } vindos de /auth/me
    // @ts-ignore
    const nr = normalizeRole(patch.user?.role || patch.user?.user_role);
    if (nr) next.role = nr;
  }

  // identidade
  if ('email' in patch) next.email = safeStr(patch.email).toLowerCase();
  if ('company' in patch) next.company = safeStr(patch.company);
  if ('cnpj' in patch) next.cnpj = safeStr(patch.cnpj);
  if ('userId' in patch) next.userId = safeStr(patch.userId);

  // expiração (metadado)
  if ('expiresAt' in patch) {
    const n = patch.expiresAt == null ? null : Number(patch.expiresAt);
    next.expiresAt = Number.isFinite(n) ? n : null;
  }

  // foco do auditor
  if ('currentAuditorProcessId' in patch) {
    const v = patch.currentAuditorProcessId;
    next.currentAuditorProcessId = v == null ? null : safeStr(v) || null;
  }

  // legado (compat)
  if ('accessToken' in patch) next.accessToken = safeStr(patch.accessToken);
  if ('tokenType' in patch) next.tokenType = safeStr(patch.tokenType) || 'bearer';

  // flag explícita
  if ('isLoggedIn' in patch) next.isLoggedIn = !!patch.isLoggedIn;

  // best-effort: se driver expôs __NCS_AUTH e ainda não temos “logado”, usa como pista
  if (!next.isLoggedIn) {
    const meta = readGlobalAuthMeta();
    if (meta.ok) next.isLoggedIn = true;

    // se ainda assim faltar role/email, tenta preencher sem sobrescrever o que já existe
    if (!next.role && meta.role) next.role = normalizeRole(meta.role) || safeStr(meta.role);
    if (!next.roles && Array.isArray(meta.roles) && meta.roles.length) next.roles = meta.roles;
    if (!next.email && meta.email) next.email = meta.email;
  }

  // derivação conservadora (compat com token legado)
  const token = safeStr(next.accessToken);
  next.isLoggedIn = Boolean(next.isLoggedIn || token);

  state.session = next;
  emitSessionChanged();
  return state.session;
}

/**
 * Limpa a sessão em memória.
 * @returns {SessionState}
 */
export function clearSession() {
  state.session = {
    isLoggedIn: false,
    role: '',
    roles: null,
    email: '',
    company: '',
    cnpj: '',
    userId: '',
    expiresAt: null,
    currentAuditorProcessId: null,

    // legados (compat)
    accessToken: '',
    tokenType: 'bearer',
  };

  emitSessionChanged();
  return state.session;
}

/**
 * @returns {boolean}
 */
export function isLoggedIn() {
  // cookie-first + best-effort meta
  if (state.session?.isLoggedIn) return true;
  const meta = readGlobalAuthMeta();
  return Boolean(meta.ok);
}

/**
 * @returns {string}
 */
export function getRole() {
  const role = safeStr(state.session?.role);
  if (role) return role;

  const meta = readGlobalAuthMeta();
  const nr = normalizeRole(meta.role || meta.roles);
  return nr || '';
}

/* ========================================================================== */
/* API: view                                                                   */
/* ========================================================================== */

/**
 * Define a view atual (para UI/nav). Router chama isso.
 * @param {any} view
 * @returns {string}
 */
export function setCurrentView(view) {
  const v = safeStr(view) || 'landing';
  state.currentView = v;
  return state.currentView;
}

/* ========================================================================== */
/* KPIs (fallback)                                                             */
/* ========================================================================== */

/**
 * Retorna KPIs calculados (fallback puro; sem depender de nenhuma store).
 * @returns {import('./types/services.js').ProcessKPIs}
 */
export function getClientKPIs() {
  return {
    pendentes: 0,
    conformes: 0,
    pontos: 0,
    // Pontuação total acumulada (soma ponderada).  Incluída como extensão
    // opcional em ProcessKPIs.
    scoreTotal: 0,
    // Pontuação total pós‑decisão (apenas itens decididos).
    scoreTotalDecidido: 0,
    // Pontuação por pilar (chaveado por E, S, G etc.).
    scorePorPilar: {},
    // Pontuação por pilar para itens decididos.
    scorePorPilarDecidido: {},
    // Pontuação por materialidade (estrutura original de ProcessKPIs).
    scorePorMaterialidade: {},
    // Nota geral agregada (globalScore em ProcessKPIs).
    globalScore: 0,
    // Pontuação por pilar no formato v2 (scoresByPillar).
    scoresByPillar: {},
    // Pontuação por materialidade no formato v2 (scoresByMateriality).
    scoresByMateriality: {},
    // Contagem de itens por status (p.ex. pending, compliant).  Mapeia status -> total.
    statusCounts: {},
    // Lista de gaps (itens que precisam de melhorias).  Pode conter qualquer tipo.
    gaps: [],
    // Lista completa de gaps (inclusive resolvidos/ocultos).
    gapsAll: [],
    // Pontuações individuais dos avaliadores.
    principalScore: 0,
    revisorScore: 0,
    // Indica se há disparidade significativa entre avaliadores.
    disparity: false,
    // Indica se existe conflito crítico bloqueando aprovação.
    hasCriticalConflict: false,
    // Mapeia identificadores de indicadores para suas pontuações.
    indicatorScores: {},
    // Mapeia ids de indicadores que exigem consenso para aprovação.
    requiresConsensusById: {},
  };
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

/**
 * Deriva um id estável o suficiente para UI/telemetria local.
 * Não substitui o userId do backend.
 * @param {string} email
 * @returns {string}
 */
export function deriveUserIdFromEmail(email) {
  const e = safeStr(email).toLowerCase();
  let h = 0;
  for (let i = 0; i < e.length; i += 1) {
    h = (h * 31 + e.charCodeAt(i)) >>> 0;
  }
  return `u_${h.toString(16)}`;
}
