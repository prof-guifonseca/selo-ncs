/**
 * @file src/dashboards/admin_actions.js
 * @module dashboards/admin_actions
 *
 * Event bindings and action handlers for the admin (gestor) dashboard.
 * This module centralises all DOM event delegation and server-side
 * mutations (triage, assign, unassign, decisions) so that the main
 * dashboard orchestrator (admin.js) can remain focused on loading
 * data and orchestrating view updates.  It mirrors the structure of
 * the auditor actions module, accepting dependencies via an options
 * object rather than importing the orchestrator directly.  When
 * installed, the module binds event listeners once per session.
 */

import * as app from '../state.js';
import * as api from '../services/api.js';
import * as audit from '../audit.js';

/**
 * Installs admin dashboard actions.  The first time this function is
 * called it will attach click and keyboard handlers to the document
 * that intercept elements with a `data-action` attribute and
 * dispatch the appropriate handler.  Subsequent calls are no-ops.
 *
 * @param {object} opts Configuration and callbacks injected from the
 *   dashboard orchestrator.
 * @param {(target:'operacao'|'ncs') => void} [opts.switchAdminTab]
 *   Callback to switch between tabs.  Defaults to a no-op.
 * @param {(processId:string) => Promise<void>|void} [opts.openAdminProcessDetail]
 *   Callback to open the detail pane for a given process.  Should
 *   return a promise when asynchronous.  Defaults to a no-op.
 * @param {() => void} [opts.closeAdminProcessDetail]
 *   Callback to close any open detail pane.  Defaults to a no-op.
 * @param {() => Promise<void>|void} [opts.refreshAdminDashboard]
 *   Callback to refresh the entire dashboard.  Defaults to a no-op.
 * @param {() => Promise<void>|void} [opts.loadMoreAdminProcesses]
 *   Callback to increment the list limit and refresh.  Defaults to a no-op.
 * @param {(message:string,tone?:'info'|'warn'|'ok') => void} [opts.notifyAdmin]
 *   Callback to display messages to the user.  When omitted a
 *   minimal notifier will be used.
 * @param {(processId:string) => Promise<void>|void} [opts.renderAdminProcessDetail]
 *   Callback to re-render the operation detail after a mutation.
 * @param {(processId:string) => Promise<void>|void} [opts.renderAdminNcsProcessDetail]
 *   Callback to re-render the NCS detail after a mutation.
 */
export function installAdminActions(opts = {}) {
  // Extract callbacks with sensible defaults.  Using object
  // destructuring allows consumers to supply only the handlers they
  // care about; missing callbacks will be safely ignored.
  const {
    switchAdminTab = () => {},
    openAdminProcessDetail = () => {},
    closeAdminProcessDetail = () => {},
    refreshAdminDashboard = () => {},
    loadMoreAdminProcesses = () => {},
    notifyAdmin: notifyCb,
    renderAdminProcessDetail = () => {},
    renderAdminNcsProcessDetail = () => {},
  } = opts || {};

  // Local variable to ensure events are bound only once.  Because the
  // module may be imported in multiple places the closure preserves
  // state across calls.
  if (installAdminActions._bound) return;
  installAdminActions._bound = true;

  /** Internal set tracking inflight operations. */
  const _inflight = new Set();

  /**
   * Wraps an async operation to prevent concurrent calls with the
   * same key.  This helper ensures that repeated clicks on action
   * buttons do not spam the backend.  When a key is already in the
   * inflight set the call is skipped.
   *
   * @param {string} key Unique identifier for the operation
   * @param {() => Promise<any>} fn Async function to execute
   * @returns {Promise<any>} The result of the provided function
   */
  function withInflight(key, fn) {
    if (_inflight.has(key)) return Promise.resolve();
    _inflight.add(key);
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        _inflight.delete(key);
      });
  }

  /**
   * Default notifier used when no notifyAdmin callback is provided.
   * It writes a simple message into the element with id
   * `admin-notice` and toggles its visibility based on the
   * message.  When a custom notifier is supplied via opts this
   * fallback is not used.
   *
   * @param {string} message Message to display
   * @param {'info'|'warn'|'ok'} [tone]
   */
  function defaultNotify(message, tone = 'info') {
    try {
      const host = document.getElementById('admin-notice');
      if (!host) return;
      const text = String(message || '').trim();
      if (!text) {
        host.hidden = true;
        host.innerHTML = '';
        return;
      }
      host.hidden = false;
      host.innerHTML = '';
      const p = document.createElement('p');
      p.className = tone === 'warn' ? 'error' : tone === 'ok' ? 'ok' : 'muted';
      p.textContent = text;
      host.appendChild(p);
    } catch {
      /* no-op */
    }
  }
  const notify = typeof notifyCb === 'function' ? notifyCb : defaultNotify;

  /**
   * Returns true when the provided element belongs to the admin UI.  The
   * logic mirrors the original `isAdminUi` helper in admin.js and
   * prevents delegation of events for unrelated elements.  When the
   * dashboard structure changes this helper may be updated accordingly.
   *
   * @param {HTMLElement} el The element to test
   * @returns {boolean}
   */
  function isAdminUi(el) {
    const op = document.getElementById('admin-panel-operacao');
    const ncs = document.getElementById('admin-panel-ncs');
    const a = document.getElementById('admin-kpi-grid');
    const b = document.getElementById('admin-process-list');
    const c = document.getElementById('admin-ncs-process-list');
    if (op && op.contains(el)) return true;
    if (ncs && ncs.contains(el)) return true;
    if (a && a.contains(el)) return true;
    if (b && b.contains(el)) return true;
    if (c && c.contains(el)) return true;
    const id = String(el.id || '');
    if (id.startsWith('admin-')) return true;
    return false;
  }

  /**
   * Performs a triage update on a process.  The function reads
   * additional notes from the textarea with id `admin-triage-notes`
   * and persists the new status via the API.  After completion it
   * emits an audit log, notifies the user and refreshes the dashboard.
   *
   * @param {string} processId Process identifier
   * @param {string} status New triage status (OK or NEEDS_FIXES)
   * @returns {Promise<void>}
   */
  function performAdminTriage(processId, status) {
    return withInflight(`triage:${processId}`, async () => {
      const updateFn = api?.updateProcessTriage;
      if (typeof updateFn !== 'function') throw new Error('API indisponível: updateProcessTriage');
      const notesEl = document.getElementById('admin-triage-notes');
      const notes = notesEl ? String(notesEl.value || '') : '';
      const actor = String(app?.state?.session?.email || 'admin');
      await updateFn(processId, { status, notes, actor });
      try {
        audit?.addAuditLog?.(status === 'OK' ? 'triage_ok' : 'triage_needs_fixes', {
          processId,
          triageStatus: status,
          notes,
        });
      } catch {
        /* ignore */
      }
      notify('Triagem registrada.', 'ok');
      await refreshAdminDashboard();
      await renderAdminProcessDetail(processId);
    }).catch((err) => {
      notify('Não foi possível registrar triagem agora.', 'warn');
      console.warn('[admin] triage falhou:', err);
    });
  }

  /**
   * Assigns principal and reviewer for a process.  Reads the values
   * from inputs `admin-assign-principal` and `admin-assign-reviewer`.
   * After persisting the assignment the dashboard is refreshed and
   * the detail view reloaded.
   *
   * @param {string} processId
   */
  function performAdminAssign(processId) {
    return withInflight(`assign:${processId}`, async () => {
      const updateFn = api?.updateProcessAssignment;
      if (typeof updateFn !== 'function') throw new Error('API indisponível: updateProcessAssignment');
      const principalInput = document.getElementById('admin-assign-principal');
      const reviewerInput = document.getElementById('admin-assign-reviewer');
      const principal = principalInput ? String(principalInput.value || '').trim() : '';
      const reviewer = reviewerInput ? String(reviewerInput.value || '').trim() : '';
      const actor = String(app?.state?.session?.email || 'admin');
      await updateFn(processId, {
        principalEmail: principal || null,
        reviewerEmail: reviewer || null,
        actor,
      });
      try {
        audit?.addAuditLog?.('assign_auditors', {
          processId,
          principalEmail: principal || null,
          reviewerEmail: reviewer || null,
        });
      } catch {
        /* ignore */
      }
      notify('Designação salva.', 'ok');
      await refreshAdminDashboard();
      await renderAdminProcessDetail(processId);
    }).catch((err) => {
      notify('Não foi possível salvar designação agora.', 'warn');
      console.warn('[admin] assign falhou:', err);
    });
  }

  /**
   * Clears the assignment of principal and reviewer for a process.
   *
   * @param {string} processId
   */
  function performAdminUnassign(processId) {
    return withInflight(`unassign:${processId}`, async () => {
      const updateFn = api?.updateProcessAssignment;
      if (typeof updateFn !== 'function') throw new Error('API indisponível: updateProcessAssignment');
      const actor = String(app?.state?.session?.email || 'admin');
      await updateFn(processId, {
        principalEmail: null,
        reviewerEmail: null,
        actor,
      });
      try {
        audit?.addAuditLog?.('unassign_auditors', { processId });
      } catch {
        /* ignore */
      }
      notify('Designação limpa.', 'ok');
      await refreshAdminDashboard();
      await renderAdminProcessDetail(processId);
    }).catch((err) => {
      notify('Não foi possível limpar designação agora.', 'warn');
      console.warn('[admin] unassign falhou:', err);
    });
  }

  /**
   * Registers a decision for the NCS tab.  Persists the decision via
   * the API, adds an audit log entry, refreshes the dashboard and
   * updates the detail view.  This helper is called when the NCS
   * decision dialog is submitted.
   *
   * @param {string} processId
   * @param {string} decisionStatus
   * @param {string} notes
   */
  async function performNcsDecision(processId, decisionStatus, notes) {
    await withInflight(`ncs-decision:${processId}`, async () => {
      const updateFn = api?.updateProcessDecision;
      if (typeof updateFn !== 'function') throw new Error('API indisponível: updateProcessDecision');
      const actor = String(app?.state?.session?.email || 'admin');
      await updateFn(processId, {
        status: String(decisionStatus || '').trim() || 'Decisão registrada',
        notes: String(notes || '').trim(),
        actor,
      });
      try {
        audit?.addAuditLog?.('ncs_decision', { processId, status: decisionStatus, notes });
      } catch {
        /* ignore */
      }
      notify('Decisão registrada.', 'ok');
      await refreshAdminDashboard();
      await renderAdminNcsProcessDetail(processId);
    }).catch((err) => {
      notify('Não foi possível registrar decisão agora.', 'warn');
      console.warn('[admin] ncs decision falhou:', err);
    });
  }

  /**
   * Ensures that the NCS decision dialog exists in the DOM and
   * attaches submission handlers.  Returns the dialog element.  When
   * the dialog does not exist it is created and appended to the
   * document body.  The submission handler reads the status and
   * notes and calls {@link performNcsDecision}.
   *
   * @returns {HTMLDialogElement}
   */
  function ensureNcsDecisionDialog() {
    let dlg = document.getElementById('admin-ncs-decision-dialog');
    if (dlg && dlg instanceof HTMLDialogElement) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'admin-ncs-decision-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="dash-card">
        <h3>Decisão NCS</h3>
        <label for="admin-ncs-decision-status">Resultado</label>
        <select id="admin-ncs-decision-status" required>
          <option value="Aprovado">Aprovado</option>
          <option value="Aprovado com ressalvas">Aprovado com ressalvas</option>
          <option value="Reprovado">Reprovado</option>
          <option value="Solicitar alinhamento">Solicitar alinhamento</option>
        </select>
        <label for="admin-ncs-decision-notes">Justificativa (curta)</label>
        <textarea id="admin-ncs-decision-notes" rows="4" placeholder="Escreva em 2–6 linhas."></textarea>
        <p class="muted">A decisão final é tomada pela NCS com base nas recomendações técnicas e nas regras do Regulamento. Esta demo não envia dados reais: se algo falhar, a decisão não será registrada.</p>
        <div class="actions-row">
          <button type="submit" class="btn btn-primary btn-small" data-action="admin-ncs-decision-confirm">Confirmar</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="admin-ncs-decision-cancel">Cancelar</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!t) return;
      const a = t.getAttribute('data-action');
      if (!a) return;
      if (a === 'admin-ncs-decision-cancel') {
        try {
          dlg.close();
        } catch {
          /* ignore */
        }
      }
    });
    dlg.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pid = String(dlg.dataset.processId || '').trim();
      if (!pid) {
        notify('Decisão sem processo selecionado.', 'warn');
        try {
          dlg.close();
        } catch {
          /* ignore */
        }
        return;
      }
      const statusEl = dlg.querySelector('#admin-ncs-decision-status');
      const notesEl = dlg.querySelector('#admin-ncs-decision-notes');
      const decisionStatus = statusEl instanceof HTMLSelectElement ? statusEl.value : 'Decisão registrada';
      const notes = notesEl instanceof HTMLTextAreaElement ? notesEl.value : '';
      await performNcsDecision(pid, decisionStatus, notes);
      try {
        dlg.close();
      } catch {
        /* ignore */
      }
    });
    return dlg;
  }

  /**
   * Opens the NCS decision dialog and initialises its fields.  The
   * dialog is created on first use.  The process id is stored on the
   * element's dataset for retrieval during submission.
   *
   * @param {string} processId
   */
  function openNcsDecisionDialog(processId) {
    const dlg = ensureNcsDecisionDialog();
    dlg.dataset.processId = String(processId || '');
    const form = dlg.querySelector('form');
    const statusEl = dlg.querySelector('#admin-ncs-decision-status');
    const notesEl = dlg.querySelector('#admin-ncs-decision-notes');
    if (form && form instanceof HTMLFormElement) form.reset();
    if (statusEl instanceof HTMLSelectElement) statusEl.value = 'Aprovado';
    if (notesEl instanceof HTMLTextAreaElement) notesEl.value = '';
    try {
      dlg.showModal();
    } catch {
      notify('Decisão: diálogo não suportado neste navegador.', 'warn');
    }
  }

  /**
   * Dispatches an action based on the `data-action` attribute of the
   * clicked element.  Unknown actions produce an info message but do
   * not break the UI.  The id associated with the action is read from
   * the `data-id` attribute.  See admin.js for the mapping of
   * actions to behaviours.
   *
   * @param {string} action
   * @param {string|null} id
   * @param {HTMLElement} el The element that triggered the action
   */
  async function dispatchAdminAction(action, id, el) {
    const pid = id != null ? String(id) : '';
    switch (action) {
      case 'admin-mode-operacao':
        switchAdminTab('operacao');
        return;
      case 'admin-mode-ncs':
        switchAdminTab('ncs');
        return;
      case 'admin-switch-tab': {
        const target = el && el.dataset ? String(el.dataset.target || '').trim().toLowerCase() : '';
        switchAdminTab(target === 'ncs' ? 'ncs' : 'operacao');
        return;
      }
      case 'admin-open-process':
        if (!pid) return;
        await openAdminProcessDetail(pid);
        return;
      case 'admin-ncs-open-process':
      case 'admin-ncs-close-detail':
      case 'admin-update-triage':
      case 'admin-ncs-decide':
      case 'admin-ncs-align':
      case 'admin-ncs-return':
        // These actions are delegated to global handlers; ignore here.
        return;
      case 'admin-close-detail':
        closeAdminProcessDetail();
        return;
      case 'admin-triage-ok':
        if (!pid) return;
        await performAdminTriage(pid, 'OK');
        return;
      case 'admin-triage-needs-fixes':
        if (!pid) return;
        await performAdminTriage(pid, 'NEEDS_FIXES');
        return;
      case 'admin-assign':
        if (!pid) return;
        await performAdminAssign(pid);
        return;
      case 'admin-unassign':
        if (!pid) return;
        await performAdminUnassign(pid);
        return;
      case 'admin-ncs-decide':
        if (!pid) return;
        openNcsDecisionDialog(pid);
        return;
      case 'admin-ncs-align':
        notify('Solicitação de alinhamento: em ativação. Será habilitado gradativamente.', 'info');
        return;
      case 'admin-ncs-return':
        notify('Devolver à Operação: em ativação. Será habilitado gradativamente.', 'info');
        return;
      case 'admin-load-more':
        await loadMoreAdminProcesses();
        return;
      case 'admin-refresh-dashboard':
        await refreshAdminDashboard();
        return;
      default:
        notify('Ação ainda não reconhecida nesta tela. Integrações serão ajustadas gradativamente.', 'info');
        return;
    }
  }

  /**
   * Attaches click and keyboard listeners to the document for
   * `data-action` delegation.  When a matching element is found the
   * corresponding handler is invoked via {@link dispatchAdminAction}.
   * The binding ensures that each element is processed only once
   * per interaction (using a busy flag).  A space or Enter key
   * activates the same behaviour as a click.
   */
  function bindAdminDashboardEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!t) return;
      const el = t.closest('[data-action]');
      if (!el) return;
      if (!isAdminUi(el)) return;
      if (e.defaultPrevented) return;
      const action = String(el.getAttribute('data-action') || '').trim();
      const id = el.getAttribute('data-id');
      if (!action) return;
      // Prevent duplicate triggers
      if (el.dataset.busy === '1') return;
      el.dataset.busy = '1';
      queueMicrotask(() => {
        try {
          delete el.dataset.busy;
        } catch {
          el.dataset.busy = '';
        }
      });
      dispatchAdminAction(action, id, el).catch((err) => {
        console.warn('[admin] action falhou:', action, err);
      });
      e.preventDefault();
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!t) return;
      const key = e.key;
      if (key !== 'Enter' && key !== ' ') return;
      const el = t.closest('[data-action]');
      if (!el) return;
      if (!isAdminUi(el)) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      el.click();
    });
  }

  // Bind events immediately when installing actions.
  bindAdminDashboardEvents();
}

// Initialise the bound flag on the function object.  This property
// lives on the function itself to persist across module reloads and
// multiple invocations.  When the dashboard orchestrator calls
// installAdminActions multiple times, the second call is a no-op.
installAdminActions._bound = false;