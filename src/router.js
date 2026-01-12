/**
 * @file src/router.js
 * @module router
 * @description Router hash (SPA) baseado em views do DOM (#view ou #view/anchor), com guard de sessão para views privadas.
 */

import { state, isLoggedIn, getRole, setCurrentView } from './state.js';
import { updateNavbar } from './navbar.js';
import { installOnce } from './utils/once.js';

/** @type {Set<string>} */
const PRIVATE_VIEWS = new Set([
  'client-dashboard',
  'auditor-dashboard',
  'admin-dashboard',
]);

/** @type {Set<string>} */
const DASHBOARD_VIEWS = new Set(['client-dashboard', 'auditor-dashboard', 'admin-dashboard']);

/** @type {string} */
const ROUTER_GUARD_KEY = '__NCS_ROUTER_BOUND__';

/* -------------------------------------------------------------------------- */
/* Pending dashboard resolution                                                */
/* -------------------------------------------------------------------------- */

const PENDING_MAX_TRIES = 20;
const PENDING_DELAY_MS = 150;

let _pendingTimer = null;
let _pendingTries = 0;

/**
 * Limpa o agendamento de resolução pendente.
 */
function clearPendingDashboard() {
  if (_pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
  _pendingTries = 0;
}

// Handlers de eventos do router.  Definidos no escopo do módulo para
// preservar a referência entre chamadas e permitir que installOnce
// identifique duplicações.
function onRouterHashChange() {
  clearPendingDashboard();
  handleRoute();
}

function onRouterAuthChanged() {
  clearPendingDashboard();
  handleRoute();
}

function onRouterSessionChanged() {
  clearPendingDashboard();
  handleRoute();
}

// Popstate handler: resolve rota após navegação do histórico (back/forward).
function onRouterPopState() {
  clearPendingDashboard();
  handleRoute();
}

/**
 * Tenta resolver "#dashboard" assim que a role hidratar.
 * É limitado e se auto-cancela se o usuário navegar para outro lugar.
 *
 * @param {string|null} anchor
 */
function schedulePendingDashboard(anchor) {
  if (_pendingTimer) return;

  const tick = () => {
    _pendingTimer = null;

    // Se saiu de "/dashboard", cancela.
    const { view } = parsePath(window.location.pathname, window.location.search);
    if (view !== 'dashboard') {
      clearPendingDashboard();
      return;
    }

    // Se não está logado, cancela (guard vai mandar para login).
    if (!isLoggedIn()) {
      clearPendingDashboard();
      handleRoute();
      return;
    }

    const role = normalizeRole(getRole());
    if (role) {
      const target = roleToDashboardView(role);
      // Resolve alias para a dashboard específica e substitui a URL.
      replacePath(buildPath(target, anchor));
      clearPendingDashboard();
      // O próprio replacePath chamará handleRoute.
      return;
    }

    if (_pendingTries++ >= PENDING_MAX_TRIES) {
      clearPendingDashboard();
      return;
    }

    _pendingTimer = setTimeout(tick, PENDING_DELAY_MS);
  };

  _pendingTries = 0;
  _pendingTimer = setTimeout(tick, PENDING_DELAY_MS);
}

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza um nome de view:
 * - remove "#" (se vier do hash)
 * - remove sufixo "-view" (se vier de id do DOM)
 * - fallback para "landing"
 *
 * @param {unknown} viewName
 * @returns {string}
 */
function normalizeViewName(viewName) {
  let v = String(viewName ?? '').replace(/^#/, '').trim();
  if (v.endsWith('-view')) v = v.slice(0, -5);
  return v || 'landing';
}

/**
 * Normaliza âncora (id do elemento no DOM).
 * @param {unknown} anchor
 * @returns {string|null}
 */
function normalizeAnchor(anchor) {
  const a = String(anchor ?? '').trim();
  return a ? a : null;
}

/**
 * Normaliza role para um conjunto conhecido.
 * Aceita sinônimos usados no código/UX.
 *
 * @param {unknown} role
 * @returns {'client'|'auditor'|'admin'|null}
 */
function normalizeRole(role) {
  const r = String(role ?? '').trim().toLowerCase();
  if (!r) return null;

  // já normalizados
  if (r === 'client' || r === 'auditor' || r === 'admin') return /** @type any */ (r);

  // sinônimos comuns
  if (r === 'participante' || r === 'empresa' || r === 'customer' || r === 'user') return 'client';

  if (r === 'avaliador' || r === 'reviewer' || r === 'principal' || r === 'revisor') return 'auditor';

  if (
    r === 'gestor' ||
    r === 'ncs' ||
    r === 'operacao' ||
    r === 'operação' ||
    r === 'operation' ||
    r === 'admin-ncs'
  ) {
    return 'admin';
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Hash + DOM helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Converte nome de view em id esperado no DOM.
 * @param {string} viewName
 * @returns {string}
 */
function viewId(viewName) {
  return `${viewName}-view`;
}

/**
 * Verifica se a view existe no DOM (tolerante a DOM parcial).
 * @param {string} viewName
 * @returns {boolean}
 */
function viewExists(viewName) {
  try {
    return Boolean(document.getElementById(viewId(viewName)));
  } catch {
    return false;
  }
}

/**
 * Mapeia role -> dashboard view.
 * @param {'client'|'auditor'|'admin'} role
 * @returns {string}
 */
function roleToDashboardView(role) {
  if (role === 'auditor') return 'auditor-dashboard';
  if (role === 'admin') return 'admin-dashboard';
  return 'client-dashboard';
}

/**
 * Faz parse do hash em { view, anchor }.
 * @param {unknown} hash
 * @returns {{ view: string, anchor: string|null }}
 */
function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '').trim();
  if (!raw) return { view: 'landing', anchor: null };
  const [view, anchor] = raw.split('/');
  return { view: normalizeViewName(view), anchor: normalizeAnchor(anchor) };
}

/*
 * --------------------------------------------------------------------------
 * History API helpers
 * --------------------------------------------------------------------------
 */

/**
 * Faz parse da URL (pathname + search) em { view, anchor } usando
 * a History API.  Este método interpreta somente o primeiro segmento do
 * caminho para determinar a view e utiliza parâmetros de query para âncoras.
 *
 * Mapeamento suportado:
 *  - "/" → landing (anchor via `?section=`)
 *  - "/login" → login
 *  - "/dashboard" → dashboard (alias pendente por role)
 *  - "/dashboard/client" → client-dashboard
 *  - "/dashboard/auditor" → auditor-dashboard
 *  - "/dashboard/admin" → admin-dashboard
 *  - "/client-dashboard", "/auditor-dashboard" e "/admin-dashboard" → respectivas views
 *  - qualquer outro primeiro segmento vira view direta (sem validação de DOM aqui)
 *
 * Para views diferentes de landing, âncoras são lidas via `?anchor=`; para
 * landing, via `?section=`.
 *
 * @param {string} pathname
 * @param {string} search
 * @returns {{ view: string, anchor: string|null }}
 */
function parsePath(pathname, search) {
  try {
    const path = String(pathname || '/').replace(/\/+/g, '/').replace(/\/+$|^\/+$/g, '/');
    // Remove múltiplos / e trailing /
    const clean = path === '/' ? '/' : path.replace(/\/+$/, '');
    const segments = clean.split('/').filter(Boolean);

    let view = 'landing';
    let anchor = null;
    const query = new URLSearchParams(search || '');

    if (segments.length === 0) {
      view = 'landing';
    } else {
      const first = normalizeViewName(segments[0]);
      if (first === 'login') {
        view = 'login';
      } else if (first === 'dashboard') {
        if (segments.length > 1) {
          const roleSeg = normalizeViewName(segments[1]);
          if (roleSeg === 'client') view = 'client-dashboard';
          else if (roleSeg === 'auditor') view = 'auditor-dashboard';
          else if (roleSeg === 'admin') view = 'admin-dashboard';
          else view = 'dashboard';
        } else {
          view = 'dashboard';
        }
      } else if (
        first === 'client-dashboard' ||
        first === 'auditor-dashboard' ||
        first === 'admin-dashboard'
      ) {
        view = first;
      } else {
        view = first;
      }
    }

    // Anchor from query: landing uses ?section=, others use ?anchor=
    if (view === 'landing') {
      const section = query.get('section');
      if (section) anchor = normalizeAnchor(section);
    } else {
      const a = query.get('anchor');
      if (a) anchor = normalizeAnchor(a);
    }

    return { view, anchor };
  } catch {
    return { view: 'landing', anchor: null };
  }
}

/**
 * Converte hashes legados (SPA hash router) para paths compatíveis com
 * History API.  Se o fragmento for reconhecido (landing/login/dashboard/*),
 * aplica um replaceState para remover o hash imediatamente.  Ignores
 * fragmentos que parecem referenciar ícones SVG (p.ex. #icon-x).
 *
 * @returns {boolean} True se a URL foi atualizada.
 */
function migrateLegacyHash() {
  try {
    const hash = String(window.location.hash || '').trim();
    if (!hash || !hash.startsWith('#')) return false;
    const raw = hash.slice(1);
    // Ignore hashes destinados a ícones (usados em <use href="#icon-x">).
    if (/^icon-/i.test(raw)) return false;
    // Parse view/anchor via parseHash (legacy helper).
    let { view, anchor } = parseHash(hash);
    view = normalizeViewName(view);
    const knownViews = new Set([
      'landing',
      'login',
      'dashboard',
      'client-dashboard',
      'auditor-dashboard',
      'admin-dashboard',
    ]);
    if (!knownViews.has(view)) return false;
    // Alias: #dashboard/client → client-dashboard
    if (view === 'dashboard') {
      const a = String(anchor || '').trim().toLowerCase();
      if (a === 'client' || a === 'auditor' || a === 'admin') {
        view = `${a}-dashboard`;
        anchor = null;
      }
    }
    const newPath = buildPath(view, anchor);
    history.replaceState(null, '', newPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Constrói um caminho absoluto (pathname + search) a partir de uma view e
 * âncora.  Utiliza o mapeamento oficial de views do aplicativo.
 * Para landing, âncoras são codificadas em `section`, enquanto para outras
 * views usa‑se `anchor`.
 *
 * @param {unknown} viewName
 * @param {unknown} anchor
 * @returns {string}
 */
function buildPath(viewName, anchor) {
  const v = normalizeViewName(viewName);
  const a = normalizeAnchor(anchor);
  if (v === 'landing') {
    return a ? `/?section=${encodeURIComponent(a)}` : '/';
  }
  if (v === 'login') {
    return a ? `/login?anchor=${encodeURIComponent(a)}` : '/login';
  }
  if (v === 'client-dashboard') {
    return a ? `/dashboard/client?anchor=${encodeURIComponent(a)}` : '/dashboard/client';
  }
  if (v === 'auditor-dashboard') {
    return a ? `/dashboard/auditor?anchor=${encodeURIComponent(a)}` : '/dashboard/auditor';
  }
  if (v === 'admin-dashboard') {
    return a ? `/dashboard/admin?anchor=${encodeURIComponent(a)}` : '/dashboard/admin';
  }
  if (v === 'dashboard') {
    return a ? `/dashboard?anchor=${encodeURIComponent(a)}` : '/dashboard';
  }
  // Fallback genérico
  return a ? `/${v}?anchor=${encodeURIComponent(a)}` : `/${v}`;
}

/**
 * Altera a URL via history.pushState e resolve a rota.  Quando o novo
 * caminho coincide com o atual (pathname + search), resolve explicitamente
 * a rota para garantir idempotência.
 *
 * @param {string} path
 */
export function pushPath(path) {
  try {
    const current = window.location.pathname + window.location.search;
    if (current !== path) {
      history.pushState(null, '', path);
      handleRoute();
    } else {
      handleRoute();
    }
  } catch {
    // Fallback: navega atribuindo href (causa reload)
    try {
      window.location.assign(path);
    } catch {
      // noop
    }
  }
}

/**
 * Substitui a entrada atual do histórico via history.replaceState e resolve
 * a rota.  Quando o novo caminho coincide com o atual, resolve
 * explicitamente a rota.
 *
 * @param {string} path
 */
export function replacePath(path) {
  try {
    const current = window.location.pathname + window.location.search;
    if (current !== path) {
      history.replaceState(null, '', path);
      handleRoute();
    } else {
      handleRoute();
    }
  } catch {
    try {
      window.location.replace(path);
    } catch {
      // noop
    }
  }
}

/**
 * Monta hash padronizado.
 * @param {unknown} view
 * @param {unknown} anchor
 * @returns {string}
 */
function buildHash(view, anchor) {
  const v = normalizeViewName(view);
  const a = normalizeAnchor(anchor);
  return a ? `#${v}/${a}` : `#${v}`;
}

/**
 * Atualiza o hash sem criar entrada no histórico.
 * @param {unknown} view
 * @param {unknown} anchor
 */
function replaceHash(view, anchor) {
  const next = buildHash(view, anchor);
  try {
    if (window.location.hash !== next) history.replaceState(null, '', next);
  } catch {
    window.location.hash = next;
  }
}

/**
 * Compatibilidade: hashes do tipo "#ncs" (sem view) viram "#landing/ncs"
 * quando existir um elemento com id="ncs" no DOM.
 *
 * @param {string} view
 * @param {string|null} anchor
 * @returns {{ view: string, anchor: string|null, normalized: boolean }}
 */
function normalizeLegacyLandingAnchors(view, anchor) {
  if (anchor) return { view, anchor, normalized: false };
  if (!view) return { view: 'landing', anchor: null, normalized: false };

  // Se é uma view real, não mexe.
  if (viewExists(view)) return { view, anchor, normalized: false };

  // Se não existe como view, mas existe como id no DOM, trata como âncora do landing.
  try {
    const el = document.getElementById(view);
    if (el && viewExists('landing')) {
      return { view: 'landing', anchor: view, normalized: true };
    }
  } catch {
    // noop
  }

  return { view, anchor, normalized: false };
}

/* -------------------------------------------------------------------------- */
/* Routing logic                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a rota final.
 * - alias "#dashboard" vira dashboard por role (quando role conhecida)
 * - views privadas exigem sessão (senão vai para "login")
 * - se role conhecida e pedir dashboard que não é seu, normaliza para o seu
 * - quando role NÃO está carregada e pedem "#dashboard", NÃO força client-dashboard
 * - fallback para "landing" se view não existir no DOM
 *
 * @param {unknown} requestedView
 * @returns {{ requested: string, target: string, shouldNormalizeHash: boolean, pendingDashboard: boolean }}
 */
function resolveRoute(requestedView) {
  const requested = normalizeViewName(requestedView);
  const role = normalizeRole(getRole());
  const expectedDashboard = role ? roleToDashboardView(role) : null;

  let target = requested;
  let shouldNormalizeHash = true;
  let pendingDashboard = false;

  // Alias: "#dashboard"
  if (requested === 'dashboard') {
    if (!isLoggedIn()) {
      target = 'login';
      shouldNormalizeHash = true;
    } else if (expectedDashboard) {
      target = expectedDashboard;
      shouldNormalizeHash = true;
    } else {
      // Sessão existe, mas role ainda não chegou:
      // mostra uma view neutra (landing) SEM normalizar o hash (#dashboard permanece),
      // e agenda resolução quando role aparecer.
      target = viewExists('landing') ? 'landing' : 'landing';
      shouldNormalizeHash = false;
      pendingDashboard = true;
    }
  }

  // Guard: views privadas sem sessão
  if (PRIVATE_VIEWS.has(target) && !isLoggedIn()) {
    target = 'login';
    shouldNormalizeHash = true;
    pendingDashboard = false;
  }

  // Offline/demo mode: allow navigation to any dashboard regardless of role.
  // The original code forced a redirect to the expected dashboard when the
  // requested dashboard did not match the user’s role.  In a static/offline
  // build there is no backend or auth, so we disable this enforcement to
  // permit viewing of the client, auditor and admin dashboards directly.

  // Admin-only tools.
  // A antiga view "admin-memberships" foi incorporada ao painel do gestor.

  // Fallback: view inexistente
  if (!viewExists(target)) {
    target = 'landing';
    shouldNormalizeHash = true;
    pendingDashboard = false;
  }

  return { requested, target, shouldNormalizeHash, pendingDashboard };
}

/**
 * Faz scroll suave até âncora (id do elemento no DOM).
 * @param {unknown} anchor
 */
function scrollToAnchor(anchor) {
  const a = normalizeAnchor(anchor);
  if (!a) return;

  requestAnimationFrame(() => {
    const el = document.getElementById(a);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * Ativa a view alvo e desativa as demais.
 * @param {string} target
 */
function setActiveView(target) {
  const targetEl = document.getElementById(viewId(target));
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  if (targetEl) targetEl.classList.add('active');
}

/**
 * Emite evento global de mudança de view.
 * @param {string} view
 */
function notifyViewChanged(view) {
  try {
    window.dispatchEvent(new CustomEvent('ncs:view:changed', { detail: { view } }));
  } catch {
    // noop
  }
}

/**
 * Mostra uma view (e opcionalmente aplica âncora).
 *
 * @param {unknown} viewName
 * @param {unknown} [anchor]
 */
export function showView(viewName, anchor) {
  const { requested, target, shouldNormalizeHash, pendingDashboard } = resolveRoute(viewName);

  // Se pediram "dashboard" mas a role ainda não chegou, agenda a resolução.
  if (pendingDashboard) schedulePendingDashboard(normalizeAnchor(anchor));

  // Quando a rota final difere da solicitada, normaliza o path.  A
  // função buildPath mapeia a view e âncora para a URL canônica.
  if (shouldNormalizeHash && target !== requested) {
    replacePath(buildPath(target, anchor));
  }

  // Idempotente: garante DOM coerente mesmo se state.currentView estiver desincronizado.
  setActiveView(target);

  const changed = state.currentView !== target;
  if (changed) {
    setCurrentView(target);
    notifyViewChanged(target);
  }

  updateNavbar();
  scrollToAnchor(anchor);
}

/**
 * Navega para uma view (e opcionalmente âncora).
 * Se o hash for o mesmo, força o showView.
 *
 * @param {unknown} viewName
 * @param {unknown} [anchor]
 */
export function navigateTo(viewName, anchor) {
  // Constrói o path para a view/ancora e utiliza pushState para navegar.
  const nextPath = buildPath(viewName, anchor);
  const current = window.location.pathname + window.location.search;
  if (current !== nextPath) {
    pushPath(nextPath);
    return;
  }
  // Se já estiver no mesmo path, força resolução idempotente.
  showView(normalizeViewName(viewName), anchor);
}

/**
 * Interpreta o hash atual e aplica a rota.
 */
/**
 * Interpreta a URL atual (pathname + search) e aplica a rota.
 * Este método é idempotente e pode ser chamado após pushState/replaceState
 * ou em resposta a eventos de navegação (popstate) e mudanças de sessão.
 */
export function handleRoute() {
  const { view, anchor } = parsePath(window.location.pathname, window.location.search);
  showView(view, anchor);
}

/**
 * Compatibilidade: interpretava o fragmento hash.  Mantemos este alias por
 * compatibilidade com chamadas internas e externas, mas delegamos para
 * handleRoute.  Hashes legados são convertidos para path no init.
 */
export function handleHash() {
  handleRoute();
}

/**
 * Força re-resolução da rota atual.
 * Útil para chamar logo após hidratar sessão/role.
 */
export function refreshRoute() {
  handleRoute();
}

/**
 * Inicializa o router (idempotente).
 */
export function initRouter() {
  if (window[ROUTER_GUARD_KEY]) {
    // Já inicializado: re-resolve a rota atual de forma assíncrona.
    try {
      queueMicrotask(handleRoute);
    } catch {
      Promise.resolve().then(handleRoute);
    }
    return;
  }

  window[ROUTER_GUARD_KEY] = true;

  // Converte hashes legados (#login, #landing/section, etc.) para paths
  // compatíveis.  Isso deve ocorrer apenas uma vez, antes de instalar
  // listeners e resolver a rota.
  try {
    migrateLegacyHash();
  } catch {
    // noop
  }

  // Instala listeners idempotentes para eventos de navegação e sessão.
  installOnce(window, 'popstate', onRouterPopState);
  installOnce(window, 'ncs:auth:changed', onRouterAuthChanged);
  installOnce(window, 'ncs:session:changed', onRouterSessionChanged);

  // Resolve rota inicial de forma assíncrona.
  try {
    queueMicrotask(handleRoute);
  } catch {
    Promise.resolve().then(handleRoute);
  }
}
