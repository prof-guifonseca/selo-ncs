/**
 * @file src/navbar.js
 * @module navbar
 * @description Navbar: menu mobile + CTAs por sessão/role + logout (cookie-first).
 */

import { state, isLoggedIn, getRole, saveSession } from './state.js';
import { logout as backendLogout } from './services/remoteDriver.js';
import { installOnce } from './utils/once.js';
import { navigateTo } from './router.js';

/**
 * Converte um nome de view em caminho absoluto (pathname) utilizado pela
 * History API.  Este helper permite definir o atributo href dos links
 * quando não houver um valor explícito.  A conversão cobre apenas as
 * rotas públicas do aplicativo; para outras views retorna `/${view}`.
 * @param {string} view
 * @returns {string}
 */
function viewToPath(view) {
  const v = String(view || '').trim();
  if (!v) return '/';
  if (v === 'landing') return '/';
  if (v === 'login') return '/login';
  if (v === 'client-dashboard') return '/dashboard/client';
  if (v === 'auditor-dashboard') return '/dashboard/auditor';
  if (v === 'admin-dashboard') return '/dashboard/admin';
  if (v === 'dashboard') return '/dashboard';
  return `/${v}`;
}

const NAV_GUARD_KEY = '__NCS_NAVBAR_BOUND__';

const IDS = {
  toggle: 'hamburger-menu',
  menu: 'nav-menu',

  dashClient: 'nav-dashboard-link',
  dashAuditor: 'nav-dashboard-auditor-link',
  dashAdmin: 'nav-dashboard-admin-link',

  logout: 'nav-logout-link',
  authClient: 'nav-auth-link',
};

/**
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function $id(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

/**
 * Normaliza role para: "client" | "auditor" | "admin" | "".
 * @returns {string}
 */
function safeGetRole() {
  try {
    const raw = String(getRole?.() || state?.session?.role || '').trim().toLowerCase();
    if (!raw) return '';

    // aliases úteis (evita cair no default/client por variações de backend)
    if (raw === 'gestor' || raw === 'operacao' || raw === 'operação' || raw === 'operation' || raw === 'ncs') return 'admin';
    if (raw === 'avaliador' || raw === 'reviewer') return 'auditor';
    if (raw === 'participante') return 'client';

    // já canônico
    if (raw === 'admin' || raw === 'auditor' || raw === 'client') return raw;

    return raw; // desconhecido -> será tratado como client no updateNavbar (fail-safe)
  } catch {
    return '';
  }
}

/**
 * @returns {boolean}
 */
function safeIsLoggedIn() {
  try {
    return !!(isLoggedIn?.() ?? state?.session?.isLoggedIn);
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement|null} el
 * @param {boolean} hidden
 */
function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = !!hidden;
  el.setAttribute('aria-hidden', String(!!hidden));
}

/**
 * @param {HTMLElement|null} btn
 * @param {boolean} expanded
 */
function setExpanded(btn, expanded) {
  if (!btn) return;
  btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

/**
 * @param {HTMLElement|null} menuEl
 * @returns {boolean}
 */
function isMenuOpen(menuEl) {
  if (!menuEl) return false;
  return menuEl.classList.contains('is-open') || menuEl.classList.contains('active') || menuEl.dataset.open === 'true';
}

/**
 * @param {boolean} [force]
 */
export function toggleMobileMenu(force) {
  const btn = $id(IDS.toggle);
  const menu = $id(IDS.menu);
  if (!menu) return;

  const nextOpen = typeof force === 'boolean' ? force : !isMenuOpen(menu);

  menu.classList.toggle('is-open', nextOpen);
  menu.classList.toggle('active', nextOpen);
  menu.dataset.open = nextOpen ? 'true' : 'false';

  menu.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
  setExpanded(btn, nextOpen);

  try {
    document.body.classList.toggle('is-menu-open', nextOpen);
  } catch {
    // noop
  }
}

function closeMobileMenu() {
  toggleMobileMenu(false);
}

/**
 * Marca item ativo conforme view (sem afetar itens de scroll do landing).
 * @param {any} currentView
 */
function setActiveLinkByView(currentView) {
  const view = String(currentView || '').trim();
  if (!view) return;

  const candidates = document.querySelectorAll('#nav-menu [data-view]');
  candidates.forEach((el) => {
    const v = String(el.dataset?.view || '').trim();
    const active = !!v && v === view;

    el.classList.toggle('active', active);

    if (el.tagName === 'A') {
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  });
}

/**
 * Retorna o elemento "clicável" dentro do container (link/botão).
 * @param {HTMLElement|null} container
 * @returns {HTMLElement|null}
 */
function getActionElement(container) {
  if (!container) return null;
  return container.querySelector?.('[data-action], a, button') || null;
}

/**
 * Garante data-action/data-view no elemento clicável interno.
 * @param {HTMLElement|null} container
 * @param {string} action
 * @param {string} [view]
 */
function ensureActionAttrs(container, action, view) {
  const el = getActionElement(container);
  if (!el) return;

  if (!el.getAttribute('data-action')) el.setAttribute('data-action', action);
  if (view && !el.getAttribute('data-view')) el.setAttribute('data-view', view);

  // Se for link e tiver view, define um href padrão quando
  // inexistente.  Utiliza rotas baseadas em History API em vez de
  // fragments (#).  Isso permite abrir em nova guia sem recarregar o
  // documento e mantém compatibilidade com o roteador.
  if (view && el.tagName === 'A') {
    const href = String(el.getAttribute('href') || '').trim();
    if (!href || href === '#' || href.startsWith('#')) {
      el.setAttribute('href', viewToPath(view));
    }
  }
}

/*
 * Handlers estáticos para eventos do navbar.  Definidos no escopo do
 * módulo para que installOnce possa identificar duplicatas e para
 * evitar criar funções anônimas dentro de initNavbar.
 */
function onNavClick(e) {
  const target = e?.target?.closest?.('#nav-menu a, #nav-menu button');
  if (!target) return;

  const action = String(target.getAttribute('data-action') || '').trim();
  const href = target.tagName === 'A' ? String(target.getAttribute('href') || '') : '';
  if (action || (href && href.startsWith('#'))) closeMobileMenu();
}

function onNavKeydown(e) {
  if (e.key === 'Escape') closeMobileMenu();
}

function onHamburgerClick(e) {
  e.preventDefault();
  toggleMobileMenu();
}

/**
 * Atualiza CTAs do navbar conforme sessão/role.
 * Também mantém o "ativo" conforme view atual.
 */
export function updateNavbar() {
  const logged = safeIsLoggedIn();
  const role = safeGetRole();

  const dashClient = $id(IDS.dashClient);
  const dashAuditor = $id(IDS.dashAuditor);
  const dashAdmin = $id(IDS.dashAdmin);
  const logout = $id(IDS.logout);

  const authClient = $id(IDS.authClient);

  if (!logged) {
    setHidden(dashClient, true);
    setHidden(dashAuditor, true);
    setHidden(dashAdmin, true);
    setHidden(logout, true);

    setHidden(authClient, false);
    closeMobileMenu();
  } else {
    setHidden(authClient, true);
    setHidden(logout, false);

    if (role === 'auditor') {
      setHidden(dashClient, true);
      setHidden(dashAuditor, false);
      setHidden(dashAdmin, true);
    } else if (role === 'admin') {
      setHidden(dashClient, true);
      setHidden(dashAuditor, true);
      setHidden(dashAdmin, false);
    } else {
      // fail-safe: se role vier “estranho”, mantém client como padrão
      setHidden(dashClient, false);
      setHidden(dashAuditor, true);
      setHidden(dashAdmin, true);
    }
  }

  try {
    setActiveLinkByView(state?.currentView);
  } catch {
    // noop
  }
}

/**
 * Inicializa navbar (idempotente).
 */
export function initNavbar() {
  if (window[NAV_GUARD_KEY]) {
    updateNavbar();
    return;
  }
  window[NAV_GUARD_KEY] = true;

  const btn = $id(IDS.toggle);
  const menu = $id(IDS.menu);

  if (btn) {
    if (!btn.getAttribute('aria-controls')) btn.setAttribute('aria-controls', IDS.menu);
    if (!btn.getAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');

    // fallback: só adiciona handler se o botão não estiver delegado por data-action
    if (!btn.getAttribute('data-action')) {
      // utiliza installOnce para prevenir duplo bind
      installOnce(btn, 'click', onHamburgerClick);
    }
  }

  if (menu) {
    if (!menu.getAttribute('role')) menu.setAttribute('role', 'list');
    if (!menu.getAttribute('aria-hidden')) menu.setAttribute('aria-hidden', 'true');
  }

  // Fallbacks: garantem data-action/data-view no elemento clicável interno
  ensureActionAttrs($id(IDS.dashClient), 'navigate-view', 'client-dashboard');
  ensureActionAttrs($id(IDS.dashAuditor), 'navigate-view', 'auditor-dashboard');
  ensureActionAttrs($id(IDS.dashAdmin), 'navigate-view', 'admin-dashboard');
  ensureActionAttrs($id(IDS.logout), 'logout');

  ensureActionAttrs($id(IDS.authClient), 'navigate-view', 'login');

  // Fecha menu ao navegar (por action ou por hash) usando handlers idempotentes
  installOnce(document, 'click', onNavClick);

  // Fecha menu via tecla Escape
  installOnce(document, 'keydown', onNavKeydown);

  updateNavbar();
}

function clearSessionInMemory() {
  try {
    if (typeof saveSession === 'function') {
      saveSession({ isLoggedIn: false, role: '', email: '', company: '' });
      return;
    }
  } catch {
    // fallback abaixo
  }

  try {
    if (state && typeof state === 'object') {
      if (!state.session || typeof state.session !== 'object') state.session = {};
      state.session.isLoggedIn = false;
      state.session.role = '';
      state.session.email = '';
      state.session.company = '';
    }
  } catch {
    // noop
  }
}

/**
 * Logout cookie-first (best-effort no backend).
 */
export function logout() {
  try {
    Promise.resolve(backendLogout()).catch(() => {});
  } catch {
    // noop
  }

  clearSessionInMemory();

  try {
    closeMobileMenu();
  } catch {
    // noop
  }

  try {
    updateNavbar();
  } catch {
    // noop
  }

  // Navega para a tela de login utilizando o roteador baseado em History API.
  try {
    navigateTo('login');
  } catch {
    // Fallback: navega para /login de forma imperativa.
    try {
      history.pushState(null, '', '/login');
      window.dispatchEvent(new Event('popstate'));
    } catch {
      window.location.href = '/login';
    }
  }
}
