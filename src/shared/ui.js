/**
 * @file src/shared/ui.js
 * @module shared/ui
 * @description Core UI helper functions shared across modules. Provides
 * basic DOM helpers, string sanitisation and HTML/CSS escaping.
 */

/*
 * Centralised helper functions
 *
 * The helpers defined in this module were previously duplicated across
 * several parts of the codebase (dashboards, reports, deliverables, audit).
 * Consolidating them here avoids divergence and simplifies maintenance.
 * These functions are defensive by default: they tolerate nullish inputs
 * and will not throw. All outputs are primitives suitable for insertion
 * into the DOM or CSS selectors. See individual JSDoc comments for usage.
 */

/**
 * Coerces any value to a trimmed string. If the result is an empty string,
 * returns the provided fallback instead (default: empty string). This helper
 * is useful when normalising values for comparison or display.
 *
 * @param {any} x The value to convert.
 * @param {string} [fallback=''] Fallback when the coerced string is empty.
 * @returns {string}
 */
export function safeStr(x, fallback = '') {
  try {
    const s = String(x ?? '').trim();
    return s || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Escapes a value for safe insertion into HTML. Converts &, <, >, " and '
 * into their corresponding HTML entities. Accepts nullish values and
 * coerces them to an empty string. Always returns a string.
 *
 * @param {any} value The value to escape.
 * @returns {string}
 */
export function escapeHtml(value) {
  const str = String(value == null ? '' : value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Alias for escapeHtml.  Historically most templates in the codebase call
 * `escapeHtml` inline to sanitise interpolated values.  This alias provides
 * a shorter name (`h`) which makes template strings easier to read.
 *
 * @type {(value: any) => string}
 */
export const h = escapeHtml;

/**
 * Safely constructs an HTML attribute string.  When the provided value is
 * nullish or the empty string, nothing is returned (no attribute).  When a
 * non‑empty value is provided it is coerced to a string, escaped using
 * {@link escapeHtml}, and prefixed with a leading space along with the
 * attribute name.  This helper reduces noise in template strings and
 * prevents accidental omission of the leading space or quote escaping.
 *
 * Example:
 *   const id = 42;
 *   `<div${attr('data-id', id)}></div>`
 *   // => '<div data-id="42"></div>'
 *
 * @param {string} name The attribute name (e.g. 'data-id', 'aria-label').
 * @param {any} value The attribute value.  Nullish or empty values omit the attribute.
 * @returns {string} A properly formatted attribute string or an empty string.
 */
export function attr(name, value) {
  const v = value == null ? '' : String(value);
  // omit attribute when the value is null, undefined or empty
  if (v === '') return '';
  return ` ${name}="${escapeHtml(v)}"`;
}

/**
 * Validates and sanitises a URL for use in href/src attributes.  Only
 * relative URLs (without a scheme) and the schemes http, https, mailto
 * and tel are permitted.  Any other scheme, including `javascript:` or
 * unknown/custom protocols, will result in an empty string being returned.
 * Trailing and leading whitespace is trimmed.  No HTML escaping is
 * performed; callers should still use {@link attr} to embed the return
 * value into an attribute.
 *
 * @param {any} url The candidate URL (may be null/undefined).
 * @param {Object} [opts] Reserved for future use.
 * @returns {string} The original URL string if allowed, otherwise an empty string.
 */
export function safeUrl(url, opts) {
  void opts; // opts are unused for now
  try {
    const raw = String(url == null ? '' : url).trim();
    if (!raw) return '';
    // Deny protocol-relative URLs (starting with //) to avoid "stealth" schemes
    if (raw.startsWith('//')) return '';
    // Determine if the URL contains a scheme (e.g. "mailto:")
    const colonIndex = raw.indexOf(':');
    if (colonIndex === -1) {
      // Relative URL (no scheme). Accept as-is.
      return raw;
    }
    const scheme = raw.slice(0, colonIndex).toLowerCase();
    if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') {
      return raw;
    }
    // Otherwise disallow unknown or dangerous schemes (e.g. javascript, data)
    return '';
  } catch {
    return '';
  }
}

/**
 * Shorthand for document.getElementById. Returns null when the element
 * does not exist. Does not throw when called in a non-browser context.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $id(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

/**
 * Shorthand for Element#querySelector. Accepts an optional parent element
 * (defaults to document). Returns the first matching element or null. If
 * provided with an invalid selector, returns null.
 *
 * @param {string} selector
 * @param {ParentNode} [parent=document]
 * @returns {Element|null}
 */
export function qs(selector, parent = /** @type {ParentNode} */ (document)) {
  try {
    return parent?.querySelector?.(selector) ?? null;
  } catch {
    return null;
  }
}

/**
 * Shorthand for Element#querySelectorAll. Accepts an optional parent element
 * (defaults to document). Returns an array of matching elements. If
 * provided with an invalid selector, returns an empty array.
 *
 * @param {string} selector
 * @param {ParentNode} [parent=document]
 * @returns {Element[]}
 */
export function qsa(selector, parent = /** @type {ParentNode} */ (document)) {
  try {
    const nodeList = parent?.querySelectorAll?.(selector);
    return nodeList ? Array.from(nodeList) : [];
  } catch {
    return [];
  }
}

/**
 * Removes all child nodes from a given element. No-op when the element
 * is nullish. Safe to call on any DOM node.
 *
 * @param {HTMLElement|null} el
 * @returns {void}
 */
export function clearEl(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Assigns the textContent of a DOM element. Converts nullish values
 * to an empty string. No-op if the element is nullish.
 *
 * @param {HTMLElement|null} el
 * @param {any} value
 * @returns {void}
 */
export function setText(el, value) {
  if (!el) return;
  el.textContent = value == null ? '' : String(value);
}

/**
 * Escapes a string for safe use in CSS selectors. Uses the native
 * `CSS.escape` when available; otherwise provides a conservative fallback
 * that escapes any character outside of [a-zA-Z0-9_-]. Accepts nullish
 * values and coerces them to an empty string.
 *
 * @param {any} value
 * @returns {string}
 */
export function cssEscape(value) {
  const str = String(value == null ? '' : value);
  try {
    // CSS.escape is available on modern browsers (e.g. Chrome, Firefox)
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(str);
    }
  } catch {
    // ignore, fallback below will handle
  }
  // Fallback: prefix non-alphanumeric characters with a backslash.
  return str.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
