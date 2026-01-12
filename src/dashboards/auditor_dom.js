/**
 * @file src/dashboards/auditor_dom.js
 * @module dashboards/auditor_dom
 *
 * A centralised DOM map and helper utilities for the auditor dashboard.
 *
 * This module exposes a minimal API for retrieving DOM elements and
 * querying within a given root.  It avoids sprinkling `document.getElementById` and
 * `querySelector` calls throughout the dashboard implementation.  Each
 * getter returns a fresh element on access, so it does not suffer from
 * stale references if the DOM is re-rendered.  No elements are cached
 * globally; callers should store references when appropriate.
 */

/**
 * Returns the element with the specified id from the document.  The id
 * parameter is coerced to string to avoid surprises.  When no element
 * exists for the provided id the return value is `null`.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function get(id) {
  return document.getElementById(String(id));
}

/**
 * A safe shorthand for `querySelector`.  When `root` is null or
 * undefined the document is used as the root.  The return value is the
 * first matching Element or `null` if none exists.
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
 * A safe shorthand for `querySelectorAll`.  When `root` is null or
 * undefined the document is used as the root.  The return value is
 * a NodeList which may be empty.  Consumers should iterate over the
 * NodeList directly or convert it to an array as needed.
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
 * Named getters for commonly used auditor dashboard elements.  Each
 * property is implemented as a getter that performs a fresh lookup on
 * every access.  This ensures that the returned element reflects the
 * current DOM, even after rerendering parts of the dashboard.
 */
export const dom = {
  /**
   * Announcer region used for screen reader feedback in the auditor dashboard.
   *
   * @returns {HTMLElement|null}
   */
  get announcer() {
    return get('auditor-dashboard-announcer');
  },

  /**
   * Main container for the full auditor dashboard view.
   *
   * @returns {HTMLElement|null}
   */
  get fullDashboard() {
    return get('auditor-full-dashboard');
  },

  /**
   * Landing view shown before the dashboard is loaded.
   *
   * @returns {HTMLElement|null}
   */
  get dashboardHome() {
    return get('auditor-dashboard-home');
  },

  /**
   * Container for top panels (KPIs and filters) in queue view.
   *
   * @returns {HTMLElement|null}
   */
  get topPanels() {
    return get('auditor-top-panels');
  },

  /**
   * Container for the queue region (includes queue list and filters).
   *
   * @returns {HTMLElement|null}
   */
  get queueRegion() {
    return get('auditor-queue-region');
  },

  /**
   * Alias to the queue container; preserved for backwards compatibility.
   *
   * @returns {HTMLElement|null}
   */
  get queue() {
    return get('auditor-queue');
  },

  /**
   * List element that holds process items in the queue.
   *
   * @returns {HTMLElement|null}
   */
  get processList() {
    return get('auditor-process-list');
  },

  /**
   * Panel that displays details of the currently selected process.
   *
   * @returns {HTMLElement|null}
   */
  get processDetail() {
    return get('auditor-process-detail');
  },

  /**
   * Grid container for the indicators table.
   *
   * @returns {HTMLElement|null}
   */
  get indicatorsGrid() {
    return get('auditor-indicators-grid');
  },

  /**
   * Summary element for SLA statistics.
   *
   * @returns {HTMLElement|null}
   */
  get slaSummary() {
    return get('auditor-sla-summary');
  },

  /**
   * Callout displayed in workspace mode.
   *
   * @returns {HTMLElement|null}
   */
  get workspaceCallout() {
    return get('auditor-workspace-callout');
  },

  /**
   * Label indicating whether queue or process detail is focused.
   *
   * @returns {HTMLElement|null}
   */
  get focusLabel() {
    return get('auditor-focus-label');
  },

  /**
   * Button that activates the summary tab inside the detail panel.
   *
   * @returns {HTMLElement|null}
   */
  get tabSummary() {
    return get('auditor-tab-summary');
  },
};