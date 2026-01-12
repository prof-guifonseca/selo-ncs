// netlify/functions/api/routes_session.js
//
// Session persistence routes.  Stores a small blob of data under
// `ncs_sessions` keyed by the authenticated user id.  This RLS‑only
// build always requires row‑level security and does not support a
// baseline fallback.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Handle the /session route.  Supports GET to fetch the session
 * payload and POST/PUT to upsert it.  Requires an authenticated
 * context and RLS enabled.
 * @param {any} event
 * @param {any} authCtx
 */
exports.handle = async function handle(event, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  // Baseline support has been removed; require RLS at all times.
  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  const userId = String(authCtx && authCtx.user && authCtx.user.id ? authCtx.user.id : '').trim();
  if (!jwt || !userId) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
  const id = `session_${userId}`;
  if (method === 'GET') {
    const row = await supa.restSelectObjectUser(
      jwt,
      'ncs_sessions',
      `id=eq.${encodeURIComponent(id)}&select=payload`
    );
    return core.json(event, 200, row && row.payload ? row.payload : {});
  }
  if (method === 'POST' || method === 'PUT') {
    const payload = core.parseJsonBody(event) || {};
    const up = await supa.restUpsertUser(
      jwt,
      'ncs_sessions',
      { id, payload: payload || {} },
      { onConflict: 'id' }
    );
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir sessão.'));
    return core.json(event, 200, { ok: true });
  }
  return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
};