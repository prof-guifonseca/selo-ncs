/**
 * @file src/dashboards/client_actions.js
 * @module dashboards/client_actions
 *
 * Event bindings and action handlers for the participant (client)
 * dashboard.  This module centralises DOM event delegation and
 * server‑side mutations (evidence uploads) so that the main
 * dashboard orchestrator (client.js) can remain focused on loading
 * data and orchestrating view updates.  The implementation mirrors
 * the approach used in the admin and auditor dashboards: a single
 * `installClientActions` function that accepts dependencies via an
 * options object and binds listeners only once.
 */

import { normalizePillar, safeCall, showToast } from './shared.js';

/**
 * Installs client dashboard actions.  The first time this function
 * is called it will attach click, keydown and change handlers to the
 * document that intercept elements with relevant `data-action`
 * attributes and dispatch the appropriate callbacks.  Subsequent
 * calls are no-ops.  Callers should supply required dependencies via
 * the `opts` object; missing callbacks will be safely ignored.
 *
 * @param {object} opts Configuration and callbacks injected from the
 *   dashboard orchestrator.
 * @param {(section:string) => void} [opts.switchClientSection] Callback
 *   invoked when the user clicks or presses Enter/Space on a
 *   `[data-action="client-switch-section"]` element.  Receives the
 *   target section.
 * @param {object} [opts.backendAdapter] Backend adapter used to
 *   register and upload evidences.  Should provide `addEvidence`,
 *   `saveEvidenceFile` and `log` methods.
 * @param {() => Promise<any>|void} [opts.ensureActiveProcess] Ensures
 *   that a process exists before performing evidence uploads.
 * @param {() => Promise<any>|void} [opts.loadClientContext] Reloads
 *   the client context (process, indicators and evidences) after
 *   uploading evidences.
 * @param {object} [opts.dashStore] Reference to the client dashboard
 *   store.  When provided its contents will be refreshed after
 *   evidence uploads.
 * @param {() => void} [opts.renderClientEvidence] Callback invoked
 *   after evidences are reloaded to render the evidence lists.
 * @param {() => void} [opts.refreshClientSelfEvidencePickers] Callback
 *   invoked after evidences are reloaded to refresh the self
 *   assessment pickers.
 */
export function installClientActions(opts = {}) {
  // Persist bound state on the function itself.  Re-entrancy is
  // prevented so that listeners are attached only once even if
  // installClientActions() is called multiple times.
  if (installClientActions._bound) return;
  installClientActions._bound = true;

  const {
    switchClientSection = () => {},
    backendAdapter = null,
    ensureActiveProcess = async () => {},
    loadClientContext = async () => {},
    dashStore = null,
    renderClientEvidence = () => {},
    refreshClientSelfEvidencePickers = () => {},
  } = opts || {};

  /**
   * Delegates section switching.  Reads the `data-section` attribute
   * and invokes the injected callback.  Also logs the action via
   * backendAdapter when available.
   *
   * @param {string} section
   */
  function handleSwitchSection(section) {
    if (!section) return;
    try {
      switchClientSection(section);
    } catch {
      /* ignore */
    }
    if (backendAdapter && typeof backendAdapter.log === 'function') {
      safeCall(() => backendAdapter.log('client-switch-section', { section }));
    }
  }

  // Click delegation for client‑specific actions
  document.addEventListener('click', (ev) => {
    // Switch section
    const btn = ev.target && typeof (ev.target).closest === 'function' ? ev.target.closest('[data-action="client-switch-section"]') : null;
    if (btn) {
      ev.preventDefault();
      const target = String(btn.dataset.section || '').trim();
      handleSwitchSection(target);
      return;
    }
    // Evidence CTA: proxy click to hidden file input
    const uploadBtn = ev.target && typeof (ev.target).closest === 'function' ? ev.target.closest('[data-action="client-evidence-select"]') : null;
    if (uploadBtn) {
      ev.preventDefault();
      const pillar = uploadBtn.dataset.pillar || '';
      const inputEl = document.getElementById(`client-evidence-input-${pillar}`);
      if (inputEl) {
        inputEl.click();
      }
      return;
    }
  });

  // Keyboard delegation for switching sections via Enter/Space
  document.addEventListener('keydown', (e) => {
    const btn = e.target && typeof (e.target).closest === 'function' ? e.target.closest('[data-action="client-switch-section"]') : null;
    if (!btn) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = String(btn.dataset.section || '').trim();
      handleSwitchSection(target);
    }
  });

  // Change delegation for evidence file inputs.  Handles the actual
  // upload logic and context reloading.  The implementation
  // replicates the behaviour from `bindEvidenceUploadEvents` in
  // client.js but is parameterised via injected dependencies.
  document.addEventListener('change', async (e) => {
    /** @type {HTMLInputElement|null} */
    const input = e.target && typeof (e.target).closest === 'function' ? e.target.closest('input.evidence-input[type="file"]') : null;
    if (!input) return;

    // Prevent double invocation if busy flag is set
    if (input.dataset.ncsBusy === 'true') return;
    input.dataset.ncsBusy = 'true';

    // Determine pillar and files
    const pillar = normalizePillar(input.dataset.pillar || 'G');
    const files = Array.from(input.files || []);
    // Reset the input value so that the same file can be selected again
    input.value = '';
    if (files.length === 0) {
      input.dataset.ncsBusy = 'false';
      return;
    }

    // Ensure process exists
    await Promise.resolve().then(() => ensureActiveProcess && ensureActiveProcess());

    // Provide immediate feedback
    showToast('Enviando evidências…', 'info');

    let savedCount = 0;
    try {
      for (const file of files) {
        let ev = null;
        try {
          if (backendAdapter && typeof backendAdapter.addEvidence === 'function') {
            ev = await backendAdapter.addEvidence(pillar, {
              name: file.name,
              size: file.size,
              type: file.type,
            });
          }
        } catch (err) {
          console.warn('[client_actions] addEvidence:', err);
          showToast('Falha ao registrar evidência.', 'error');
          continue;
        }
        if (!ev || !ev.id) {
          showToast('Falha ao registrar evidência (sem id).', 'error');
          continue;
        }
        try {
          if (backendAdapter && typeof backendAdapter.saveEvidenceFile === 'function') {
            const metaCompleto = {
              id: ev.id,
              evidenceId: ev.id,
              pillar,
              name: file.name,
              filename: file.name,
              size: file.size,
              type: file.type,
              createdAt: new Date().toISOString(),
            };
            await backendAdapter.saveEvidenceFile(ev.id, file, metaCompleto);
          }
        } catch (err) {
          console.warn('[client_actions] saveEvidenceFile:', err);
          showToast('Falha ao salvar a evidência.', 'error');
          continue;
        }
        savedCount += 1;
        if (backendAdapter && typeof backendAdapter.log === 'function') {
          safeCall(() => backendAdapter.log('add-evidence', { evidenceId: ev.id, pillar, name: file.name }));
        }
      }
    } finally {
      // Reload client context after uploads
      try {
        await Promise.resolve().then(() => loadClientContext && loadClientContext());
      } catch {
        /* no-op: fall back to previous state */
      }
      // Re-render evidence lists and self evidence pickers
      safeCall(() => renderClientEvidence && renderClientEvidence());
      safeCall(() => refreshClientSelfEvidencePickers && refreshClientSelfEvidencePickers());
      // Provide feedback on saved count
      if (savedCount > 0) {
        showToast(savedCount === 1 ? 'Evidência salva' : 'Evidências salvas', 'success');
      }
      input.dataset.ncsBusy = 'false';
    }
  });
}