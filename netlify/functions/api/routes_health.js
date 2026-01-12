// netlify/functions/api/routes_health.js
//
// Implementation of the health check endpoint.  Returns basic
// diagnostic information about the backend and build configuration.

'use strict';

const core = require('./core.js');

/**
 * Handle the /health route.  Accepts only GET or HEAD requests and
 * returns a JSON payload indicating that the service is operational.
 * Includes build-time flags such as whether authentication is required
 * and whether row-level security is enabled.  When invoked with a
 * HEAD request the body is stripped from the response.
 * @param {any} event
 */
exports.handle = async function handle(event) {
  const method = core.normalizeMethod(event.httpMethod);
  if (method !== 'GET' && method !== 'HEAD') {
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Use GET.'));
  }
  const payload = {
    ok: true,
    time: core.nowIso(),
    context: String(process.env.NETLIFY_CONTEXT || process.env.CONTEXT || '').trim() || null,
    auth_required: core.isAuthRequired(),
    rls_enabled: core.isRlsEnabled(),
  };
  const res = core.json(event, 200, payload);
  return method === 'HEAD' ? Object.assign({}, res, { body: '' }) : res;
};