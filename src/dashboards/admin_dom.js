/**
 * @file src/dashboards/admin_dom.js
 * @module dashboards/admin_dom
 *
 * Centralised DOM helpers for the admin dashboard.  These utilities
 * provide simple wrappers around common DOM queries and expose
 * named getters for frequently used dashboard elements.  Using
 * centralised lookups avoids scattering `document.getElementById`
 * and `querySelector` calls throughout the codebase and makes it
 * easier to update IDs in a single location.
 */

/**
 * Returns the element with the specified id from the document.  The
 * id is coerced to a string to prevent surprises.  When no element
 * exists the return value is `null`.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function get(id) {
  return document.getElementById(String(id));
}

/**
 * Shorthand for `querySelector`.  When `root` is null or undefined
 * the document is used as the root.  Returns the first matching
 * element or `null`.
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
 * Shorthand for `querySelectorAll`.  When `root` is null or undefined
 * the document is used as the root.  Returns a NodeList which may
 * be empty.  Consumers should iterate over the NodeList directly or
 * convert it to an array as needed.
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
 * Named getters for commonly used admin dashboard elements.  Each
 * property is implemented as a getter that performs a fresh lookup
 * on every access.  This ensures that the returned element reflects
 * the current DOM, even after rerendering parts of the dashboard.
 */
export const dom = {
  /**
   * Announcer region used for screen reader feedback in the admin dashboard.
   *
   * @returns {HTMLElement|null}
   */
  get announcer() {
    return get('admin-dashboard-announcer');
  },

  /**
   * KPI grid container.
   * @returns {HTMLElement|null}
   */
  get kpiGrid() {
    return get('admin-kpi-grid');
  },

  /**
   * Process list for the Operação tab.
   * @returns {HTMLElement|null}
   */
  get processList() {
    return get('admin-process-list');
  },

  /**
   * Process list for the NCS tab.
   * @returns {HTMLElement|null}
   */
  get ncsProcessList() {
    return get('admin-ncs-process-list');
  },

  /**
   * Detail container for the Operação tab.
   * @returns {HTMLElement|null}
   */
  get processDetail() {
    return get('admin-process-detail');
  },

  /**
   * Detail container for the NCS tab.
   * @returns {HTMLElement|null}
   */
  get ncsProcessDetail() {
    return get('admin-ncs-process-detail');
  },
};