// src/main.js — Bootstrap (UI wiring)

// Budget: 255 linhas — atualize ao modificar (evita inchaço)
import { initNavbar, updateNavbar } from './navbar.js';
// Loader de marca: aplica skin e textos antes de qualquer renderização.
import { initBrand } from './brand.js';
import { initRouter } from './router.js';
import { handleAction } from './actions.js';
import { initializeChat } from './chat.js';
// Telemetria: captura erros globais e rejeições não tratadas
import { initTelemetry } from './telemetry/client.js';
import { installOnce } from './utils/once.js';
import {
  handleLogin,
  handleRegister,
  hydrateSession,
} from './auth.js';

// Import dashboards explicitly so they can be initialized when the corresponding
// view becomes active. Without calling the init functions the dashboards
// never render because they rely on their own boot logic (bind events,
// fetch data etc.). These imports have no side effects beyond making
// the functions available here.
import { initClientDashboard } from './dashboards/client.js';
import { initAuditorDashboard } from './dashboards/auditor.js';
import { initAdminDashboard } from './dashboards/admin.js';

/* ==========================================================================
  Boot guard + ready helper
============================================================================ */

let _started = false;

/**
 * @param {() => void} fn
 */
function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/* ==========================================================================
  API base (CSP-safe)
============================================================================ */

function initApiBaseFromShell() {
  try {
    if (typeof window !== 'undefined' && window.NCS_API_BASE) return;

    const meta = document.querySelector('meta[name="ncs-api-base"]');
    const metaBase = meta ? String(meta.getAttribute('content') || '').trim() : '';
    const bodyBase =
      document.body && document.body.dataset && document.body.dataset.apiBase
        ? String(document.body.dataset.apiBase).trim()
        : '';

    const raw = (metaBase || bodyBase || '').trim();
    if (!raw) return;

    window.NCS_API_BASE = raw.replace(/\/+$/, '');
  } catch {
    // best-effort
  }
}

/* ==========================================================================
  Event delegation (data-action)
============================================================================ */

/**
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isEffectivelyDisabled(el) {
  try {
    // @ts-ignore
    if (typeof el.disabled === 'boolean' && el.disabled) return true;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {Event} e
 */
function onDelegatedAction(e) {
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target) return;

  const el = target.closest('[data-action]');
  if (!el) return;
  if (isEffectivelyDisabled(el)) return;

  const action = String(el.getAttribute('data-action') || '').trim();
  if (!action) return;

  try {
    e.preventDefault?.();
    e.stopPropagation?.();
  } catch {
    // noop
  }

  try {
    Promise.resolve(handleAction(action, el, e)).catch(() => {});
  } catch {
    // Compat: tenta handleAction(action, event) para chamadas legadas.
    try {
      // @ts-ignore compatibilidade com assinatura legada
      Promise.resolve(handleAction(action, e)).catch(() => {});
    } catch {}
  }
}

// Handler específico para pressionar Enter.  Este wrapper delega
// para onDelegatedAction apenas quando a tecla pressionada for Enter.
// Mantido fora do boot() para que a mesma referência seja reutilizada
// em chamadas subsequentes, permitindo que installOnce previna binds duplicados.
function onEnterDelegated(e) {
  if (e && e.key !== 'Enter') return;
  onDelegatedAction(e);
}

/* ==========================================================================
  Forms (auth)
============================================================================ */

/**
 * @param {string} id
 * @returns {HTMLFormElement|null}
 */
function getFormById(id) {
  const el = document.getElementById(id);
  return el && el.tagName === 'FORM' ? /** @type {HTMLFormElement} */ (el) : null;
}

/**
 * @param  {...string} ids
 * @returns {HTMLFormElement|null}
 */
function getFirstFormByIds(...ids) {
  for (const id of ids) {
    const f = getFormById(id);
    if (f) return f;
  }
  return null;
}

function bindAuthForms() {
  // IDs kebab-case (atuais) + fallback para legados
  const loginForm = getFirstFormByIds('login-form', 'loginForm');
  if (loginForm) installOnce(loginForm, 'submit', handleLogin);

  const registerForm = getFirstFormByIds('register-form', 'registerForm');
  if (registerForm) installOnce(registerForm, 'submit', handleRegister);
}

/* ==========================================================================
  Boot
============================================================================ */

async function boot() {
  if (_started) return;
  _started = true;

  // Inicializa telemetria (best‑effort).  Não envia eventos se
  // window.__NCS_TELEMETRY_OFF__ estiver definido.  A captura ocorre cedo no
  // ciclo de boot para registrar erros de inicialização.
  try {
    initTelemetry();
  } catch {
    // ignore
  }

  initApiBaseFromShell();

  // Aplica marca (white‑label) assim que possível.  O await garante que
  // config.json e CSS sejam carregados antes da renderização, mas a
  // operação é tolerante a falhas: erros são capturados internamente em
  // initBrand().
  try {
    await initBrand();
  } catch {
    // ignore
  }

  // Instala listeners delegados de forma idempotente utilizando installOnce.
  installOnce(document, 'click', onDelegatedAction);
  installOnce(document, 'keydown', onEnterDelegated);

  bindAuthForms();

  try {
    initNavbar();
  } catch {}

  // O modo de demonstração foi descontinuado. Se a URL contiver um
  // parâmetro obsoleto que habilitava esse modo, ele será ignorado e o
  // boot seguirá a hidratação normal da sessão real.

  // Hidrata sessão antes do router (guards dependem disso). Nunca quebra o boot.
  try {
    await hydrateSession();
  } catch {}

  try {
    initRouter();
  } catch {}

  try {
    updateNavbar();
  } catch {}

  try {
    initializeChat();
  } catch {}

  // When the SPA view changes, initialize the appropriate dashboard on demand.
  // Each dashboard exposes an idempotent init function guarded by an internal
  // flag (e.g. `_adminBooted`, `_clientInit`, `_auditorInit`) so repeated
  // calls are harmless. This listener ensures that visiting the
  // admin/auditor/client dashboards triggers their initialization and
  // subsequent data fetch/render logic.
  try {
    window.addEventListener('ncs:view:changed', (e) => {
      const view = e && e.detail ? String(e.detail.view || '') : '';
      switch (view) {
        case 'client-dashboard':
          Promise.resolve(initClientDashboard()).catch(() => {});
          break;
        case 'auditor-dashboard':
          Promise.resolve(initAuditorDashboard()).catch(() => {});
          break;
        case 'admin-dashboard':
          Promise.resolve(initAdminDashboard()).catch(() => {});
          break;
        default:
          // no-op for other views
          break;
      }
    });
  } catch {
    // best-effort: if the event cannot be bound, dashboards may still
    // initialize via manual actions.
  }
}

onReady(() => {
  void boot();
});
