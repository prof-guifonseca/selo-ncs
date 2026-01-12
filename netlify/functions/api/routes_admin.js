// netlify/functions/api/routes_admin.js
//
// Administrative utility routes. This module exposes admin-only endpoints
// that are not part of the core certification workflow. Currently it
// implements a single RPC-backed route to resolve a user by email. When
// adding new administrative operations, follow the same pattern: validate
// authentication, restrict to admins, normalise inputs and guard against
// invalid payloads. Keep the surface area minimal to avoid exposing
// dangerous service role capabilities to the public.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Enforces that the current session is authenticated and has admin
 * privileges. When authentication is disabled (for example in local
 * development with NCS_REQUIRE_AUTH=0) this check becomes a no-op.
 *
 * @param {any} authCtx Authentication context built by auth.js
 * @returns {null|any} Returns null when allowed or an error object
 */
function requireAdmin(authCtx) {
  if (!core.isAuthEnabled()) return null;
  if (!authCtx || !authCtx.userId) return core.err('AUTH_REQUIRED', 'Sessão obrigatória.');
  if (!authCtx.isAdmin) return core.err('FORBIDDEN', 'Acesso restrito (admin).');
  return null;
}

/**
 * Simple email validator. Uses a basic regex to ensure the input
 * contains one @ and at least one dot after the @. It does not
 * guarantee deliverability but rejects obvious invalid strings.
 *
 * @param {string} val
 * @returns {boolean}
 */
function validateEmailFormat(val) {
  const s = String(val || '').trim();
  // Simplified RFC5322: non-whitespace before and after @ and at least one dot
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(s);
}

/**
 * Administrative route handler. Supports the following path:
 *
 *   POST /api/admin/resolve-user
 *     Body: { email }
 *     Returns: { ok: true, user: { id, email } } when found,
 *               { ok: false } when no matching user exists.
 *
 * Invalid methods return 405, unauthenticated or non-admin callers
 * receive appropriate 401/403 errors and invalid payloads return 400.
 *
 * @param {any} event Netlify event
 * @param {string[]} segments URL path segments split by core.splitPath
 * @param {any} authCtx Authentication context from auth.buildAuthContext
 */
async function handle(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  // Require admin privileges on all admin routes
  const adminErr = requireAdmin(authCtx);
  if (adminErr) return core.json(event, adminErr.code === 'AUTH_REQUIRED' ? 401 : 403, adminErr);

  // Expect at least two segments: ['admin', '<subRoute>']
  if (!Array.isArray(segments) || segments.length < 2) {
    return core.json(event, 404, core.err('NOT_FOUND', 'Rota inválida.'));
  }
  const sub = String(segments[1] || '').trim().toLowerCase();

  // Only resolve-user is currently supported
  if (sub !== 'resolve-user') {
    return core.json(event, 404, core.err('NOT_FOUND', 'Rota inválida.'));
  }

  if (method !== 'POST') {
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  // Parse and normalise body
  const body = core.parseJsonBody(event) || {};
  const rawEmail = body.email != null ? body.email : null;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !validateEmailFormat(email)) {
    return core.json(event, 400, core.err('VALIDATION', 'E-mail inválido.'));
  }

  // Invoke RPC via service role. The RPC returns an array of rows or a
  // single object. On failure we log a DB error; on success we
  // normalise the output. Using supabaseFetchAdmin ensures the
  // SUPABASE_SERVICE_ROLE_KEY is used.
  try {
    const rpcRes = await supa.supabaseFetchAdmin('/rest/v1/rpc/ncs_resolve_user_by_email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { p_email: email },
    });
    if (!rpcRes.ok) {
      return core.json(event, 500, core.err('DB', 'Falha ao resolver usuário.'));
    }
    const rows = Array.isArray(rpcRes.data) ? rpcRes.data : rpcRes.data ? [rpcRes.data] : [];
    const row = rows && rows[0] ? rows[0] : null;
    if (row && row.user_id) {
      return core.json(event, 200, { ok: true, user: { id: row.user_id, email: row.email || email } });
    }
    return core.json(event, 200, { ok: false });
  } catch (err) {
    return core.json(event, 500, core.err('DB', 'Falha ao resolver usuário.'));
  }
}

module.exports = { handle };