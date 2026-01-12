// netlify/functions/api/routes_appstate.js
//
// Application state persistence.  This route stores per-user
// application state such as UI preferences.  In this RLS‑only build
// baseline support has been removed; the route always requires an
// authenticated context and row‑level security.  The state is stored
// in the ncs_app_state table keyed by the authenticated user id.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Handle the /app-state route.  Supports GET to retrieve the state
 * and POST/PUT to update it.  Requires RLS to be enabled and an
 * authenticated context with a valid JWT.
 * @param {any} event
 * @param {any} authCtx
 */
exports.handle = async function handle(event, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  // Baseline support has been removed; require RLS at all times.
  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  const userId = String(authCtx && authCtx.user && authCtx.user.id ? authCtx.user.id : '').trim();
  if (!jwt || !userId) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
  const id = `app_${userId}`;
  if (method === 'GET') {
    const row = await supa.restSelectObjectUser(
      jwt,
      'ncs_app_state',
      `id=eq.${encodeURIComponent(id)}&select=payload`
    );
    return core.json(event, 200, row && row.payload ? row.payload : {});
  }
  if (method === 'POST' || method === 'PUT') {
    const payload = core.parseJsonBody(event) || {};
    const up = await supa.restUpsertUser(
      jwt,
      'ncs_app_state',
      { id, payload: payload || {} },
      { onConflict: 'id' }
    );
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir estado do app.'));
    return core.json(event, 200, { ok: true });
  }
  return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
};