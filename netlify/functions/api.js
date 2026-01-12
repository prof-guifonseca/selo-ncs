/**
 * netlify/functions/api.js
 *
 * Entrypoint for the Netlify "api" function.
 *
 * Netlify resolves function redirects such as `/api/*` to a file named
 * `api.{js,mjs,cjs,ts}` within the configured functions directory.  In a
 * previous refactor the implementation for the API was moved into
 * `netlify/functions/api/index.js` (and supporting modules), but the
 * redirect configuration in `netlify.toml` still points to
 * `/.netlify/functions/api`.  Without a file named `api.js` present,
 * Netlify reports the function as missing and the build fails.
 *
 * This wrapper file bridges that gap by importing the real API
 * implementation from the `api/` subdirectory and re‑exporting its
 * `handler` function.  It also re‑exports the ancillary route handlers to
 * preserve backwards compatibility with existing imports.  Should the
 * implementation be further modularised, this file can be updated to
 * delegate accordingly without changing the redirect configuration.
 */

'use strict';

/**
 * Typedefs imported from the Netlify Functions SDK.
 *
 * These provide better editor support and satisfy documentation checks
 * enforced by the smoke tests.  They mirror the definitions used in
 * other functions within this repository.
 *
 * @typedef {import('@netlify/functions').HandlerEvent} NetlifyEvent
 * @typedef {import('@netlify/functions').HandlerContext} NetlifyContext
 * @typedef {import('@netlify/functions').HandlerResponse} NetlifyResponse
 */

// Import the underlying implementation.  This file must exist and
// export a `handler` function to satisfy Netlify's Lambda interface.
const apiImpl = require('./api/index.js');

// Primary entrypoint: Netlify looks for `exports.handler`.
//
// We provide a small wrapper around the underlying handler to attach
// a JSDoc signature.  This improves DX and satisfies the smoke test
// that ensures all handlers are documented.
/**
 * Delegates execution to the implementation located in
 * `netlify/functions/api/index.js`.
 *
 * @param {NetlifyEvent} event - Incoming request from Netlify.
 * @param {NetlifyContext} context - Netlify context provided at runtime.
 * @returns {Promise<NetlifyResponse>} A promise resolving to the HTTP response.
 */
exports.handler = function handler(event, context) {
  return apiImpl.handler(event, context);
};

// Re‑export optional route handlers.  If any of these are undefined in
// the implementation they will remain undefined here.  This pattern
// ensures consumers can continue to destructure individual handlers
// without referring to the monolithic index directly.
exports.handleHealth = apiImpl.handleHealth;
exports.handleAuth = apiImpl.handleAuth;
exports.handleAppState = apiImpl.handleAppState;
exports.handleSession = apiImpl.handleSession;
exports.handleProcesses = apiImpl.handleProcesses;
// Removed auditor handler re-export. The auditor API is no longer implemented
// and this re-export referenced an undefined handler.
// exports.handleAuditor = apiImpl.handleAuditor;
exports.handlePublicPages = apiImpl.handlePublicPages;
exports.handleEvidences = apiImpl.handleEvidences;