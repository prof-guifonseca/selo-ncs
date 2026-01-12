/**
 * @file src/dashboards/client_dom.js
 * @module dashboards/client_dom
 *
 * Centralised DOM helpers for the client dashboard.  These helpers
 * consolidate common queries used throughout the participant dashboard
 * into a single module.  By importing selectors from this file
 * consumers avoid scattering `document.getElementById` or
 * `querySelector` calls across multiple modules and make it easy to
 * update IDs in one place.  All helpers return `null` when the
 * corresponding element does not exist; no exceptions are thrown.
 */

/**
 * Shorthand for `querySelector`.  When a root is not provided the
 * document is used as the default.  Returns the first matching
 * element or `null` when none is found.
 *
 * @param {Element|Document|null|undefined} root
 * @param {string} selector
 * @returns {Element|null}
 */
export function qs(root, selector) {
  const r = root || document;
  return r.querySelector(selector);
}

/**
 * Shorthand for `querySelectorAll`.  When a root is not provided the
 * document is used as the default.  Returns a NodeList (which may be
 * empty) of all matching elements.
 *
 * @param {Element|Document|null|undefined} root
 * @param {string} selector
 * @returns {NodeListOf<Element>}
 */
export function qsa(root, selector) {
  const r = root || document;
  return r.querySelectorAll(selector);
}

/**
 * Returns the root container for the full client dashboard.  This
 * corresponds to the element with id `client-full-dashboard` and is
 * shown when the participant expands the dashboard view.  When the
 * element is not present the function returns `null`.
 *
 * @returns {HTMLElement|null}
 */
export function getRoot() {
  return document.getElementById('client-full-dashboard');
}

/**
 * Returns the container for the home view of the client dashboard.  This
 * corresponds to the element with id `client-dashboard-home` and is
 * hidden when the full dashboard is displayed.
 *
 * @returns {HTMLElement|null}
 */
export function getView() {
  return document.getElementById('client-dashboard-home');
}

/**
 * Returns the announcer element used for screen reader feedback on the
 * participant dashboard.  The announcer is typically hidden from
 * visual layout and is updated to announce loading or error states.
 *
 * @returns {HTMLElement|null}
 */
export function getAnnouncer() {
  return document.getElementById('client-dashboard-announcer');
}

/**
 * Returns the evidence list container for a given pillar.  Pillars are
 * expected to be normalised (e.g. 'E', 'S', 'G').  When the element
 * cannot be found the function returns `null`.
 *
 * @param {string} pillar
 * @returns {HTMLElement|null}
 */
export function getEvidenceList(pillar) {
  if (!pillar) return null;
  return document.getElementById(`client-evidence-list-${pillar}`) || null;
}

/**
 * Returns the evidence file input for a given pillar.  Each pillar has an
 * associated hidden input of type file used for uploads.  Returns
 * `null` when the input cannot be found.
 *
 * @param {string} pillar
 * @returns {HTMLInputElement|null}
 */
export function getEvidenceInput(pillar) {
  if (!pillar) return null;
  return /** @type {HTMLInputElement|null} */ (document.getElementById(`client-evidence-input-${pillar}`) || null);
}

/**
 * Returns the container for the deliverables preview.  When the
 * participant navigates to the “Entregas” tab the preview HTML is
 * inserted into this element.
 *
 * @returns {HTMLElement|null}
 */
export function getDeliverablesPreview() {
  return document.getElementById('client-deliverables-preview');
}

/**
 * Returns the container for the action plan preview.  The plan
 * preview is generated on the client using the indicators and
 * inserted into this element.
 *
 * @returns {HTMLElement|null}
 */
export function getPlanPreview() {
  return document.getElementById('client-plan-preview');
}

/**
 * Returns the card element for the seal/certificate preview.  The
 * certificate HTML is inserted into this element when the participant
 * navigates to the “Selo” tab.
 *
 * @returns {HTMLElement|null}
 */
export function getSealCard() {
  return document.getElementById('client-seal-card');
}

/**
 * Returns the download button for the seal/certificate.  The button
 * state is toggled based on the process status.  Returns `null` when
 * the button does not exist in the DOM.
 *
 * @returns {HTMLButtonElement|null}
 */
export function getSealDownloadBtn() {
  return /** @type {HTMLButtonElement|null} */ (document.getElementById('client-seal-download-btn') || null);
}

/**
 * Returns the element that displays the download hint for the
 * certificate.  The hint is updated when the certificate becomes
 * available after validation.  Returns `null` when absent.
 *
 * @returns {HTMLElement|null}
 */
export function getSealDownloadHint() {
  return document.getElementById('client-seal-download-hint');
}

/**
 * Returns the container for the self‑assessment table.  This is
 * where the generated self‑assessment HTML is injected.
 *
 * @returns {HTMLElement|null}
 */
export function getSelfAssessmentContainer() {
  return document.getElementById('client-self-assessment');
}

/**
 * Returns the form element for the participant profile.  The
 * `client-profile-form` contains basic organisation fields and ESG
 * questions.  Returns `null` when the form is not present.
 *
 * @returns {HTMLFormElement|null}
 */
export function getProfileForm() {
  return /** @type {HTMLFormElement|null} */ (document.getElementById('client-profile-form') || null);
}

/**
 * Returns the container for the indicators overview table.  The
 * overview summarises the participant’s answers and evidence counts.
 *
 * @returns {HTMLElement|null}
 */
export function getIndicatorsOverview() {
  return document.getElementById('client-indicators-overview');
}

/**
 * Returns the KPI card element for pendentes.  The KPI numbers are
 * updated when the dashboard state changes.
 *
 * @returns {HTMLElement|null}
 */
export function getKpiPendentes() {
  return document.getElementById('home-kpi-pendentes');
}

/**
 * Returns the KPI card element for conformes.
 *
 * @returns {HTMLElement|null}
 */
export function getKpiConformes() {
  return document.getElementById('home-kpi-conformes');
}

/**
 * Returns the KPI card element for pontos.
 *
 * @returns {HTMLElement|null}
 */
export function getKpiPontos() {
  return document.getElementById('home-kpi-pontos');
}

/**
 * Returns the element displaying the participant company name in the
 * header.  This element is bound via `bindText` to update the
 * organisation name after loading the client context.
 *
 * @returns {HTMLElement|null}
 */
export function getCompanyNameEl() {
  return document.getElementById('client-company-name');
}

// Additional section getters may be added here as the dashboard evolves.