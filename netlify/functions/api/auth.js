// netlify/functions/api/auth.js
//
// This module implements session and authentication helpers.  It
// provides a high level interface for validating JWTs, refreshing
// access tokens, resolving the current session from cookies or
// Authorization headers and enforcing authentication for sensitive
// routes.  It depends on the core and supabase modules for low
// level utilities and data access.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

// ---------------------------------------------------------------------------
// Token validation and role retrieval
// ---------------------------------------------------------------------------

/**
 * Validate a JWT against Supabase's /auth/v1/user endpoint.  Returns
 * { ok: false } when the token is missing or invalid.  On success
 * returns { ok: true, user: { id, email } }.
 * @param {string} token
 * @returns {Promise<{ ok: true, user: { id: string, email: string } } | { ok: false }>}
 */
async function validateToken(token) {
  const t = String(token || '').trim();
  if (!t) return { ok: false };
  const r = await supa.supabaseFetchAuth('/auth/v1/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok || !r.data || typeof r.data !== 'object') return { ok: false };
  const id = String(r.data.id || '').trim();
  const email = String(r.data.email || '').trim();
  if (!id) return { ok: false };
  return { ok: true, user: { id, email } };
}

/**
 * Look up roles for the given user from the ncs_memberships table.  When
 * a service role key is configured the query is executed as an admin.
 * Otherwise falls back to using the anonymous key with a user JWT.  If
 * no roles are found or errors occur, returns an empty list.  The
 * isAdmin flag is true when the roles array includes 'admin'.
 * @param {string} userId
 * @param {string} [jwt]
 * @returns {Promise<{ roles: string[], isAdmin: boolean }>}
 */
async function getUserRoles(userId, jwt) {
  const uid = String(userId || '').trim();
  if (!uid) return { roles: [], isAdmin: false };
  const q = `/rest/v1/ncs_memberships?select=role,is_active&user_id=eq.${encodeURIComponent(
    uid
  )}&is_active=eq.true`;
  /** @type {{ ok: boolean, status: number, data: any }} */
  let r = { ok: false, status: 0, data: null };
  const hasServiceRole = !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const hasAnon = !!String(process.env.SUPABASE_ANON_KEY || '').trim();
  // When row‑level security is enabled we do not use the service role to
  // fetch membership rows.  This prevents accidental bypasses via
  // service role queries.  Instead we fall back to the user JWT and
  // anonymous key.  See docs/dev/SECURITY_MODEL.md for details.
  const rlsEnabled = String(process.env.NCS_USE_RLS || '1').trim() !== '0';
  const t = String(jwt || '').trim();
  if (hasServiceRole && !rlsEnabled) {
    r = await supa.supabaseFetchAdmin(q, { method: 'GET' });
  } else if (hasAnon && t) {
    r = await supa.supabaseFetchUser(t, q, { method: 'GET' });
  } else {
    return { roles: [], isAdmin: false };
  }
  if (!r.ok || !Array.isArray(r.data)) return { roles: [], isAdmin: false };
  const roles = r.data
    .map((x) => String(x && x.role ? x.role : '').trim().toLowerCase())
    .filter(Boolean);
  return { roles, isAdmin: roles.includes('admin') };
}

// ---------------------------------------------------------------------------
// Bearer parsing
// ---------------------------------------------------------------------------

/**
 * Extract a bearer token from the Authorization header.  Returns an
 * empty string if not present or not matching the Bearer scheme.
 * @param {any} req
 * @returns {string}
 */
function parseBearerToken(req) {
  const headers = req && typeof req === 'object' && 'headers' in req ? req.headers : req;
  const h = core.normalizeHeaderMap(headers || {});
  const raw = String(h.authorization || '').trim();
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

/**
 * Refresh an access token using a refresh token via Supabase's auth API.
 * On success, sets new cookies on the event and returns the new token
 * details.  On failure returns { ok: false }.
 * @param {any} event
 * @param {string} refreshToken
 * @returns {Promise<{ ok: boolean, accessToken?: string, refreshToken?: string, expiresIn?: number }>}
 */
async function refreshAccessToken(event, refreshToken) {
  const rt = String(refreshToken || '').trim();
  if (!rt) return { ok: false };
  const r = await supa.supabaseFetchAuth('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { refresh_token: rt },
  });
  if (!r.ok || !r.data || typeof r.data !== 'object') return { ok: false };
  const accessToken = String(r.data.access_token || '').trim();
  const nextRefresh = String(r.data.refresh_token || '').trim() || rt;
  const expiresIn = Number(r.data.expires_in || 0) || 0;
  if (!accessToken) return { ok: false };
  core.pushSetCookies(event, [
    core.buildAccessCookie(event, accessToken, expiresIn),
    core.buildRefreshCookie(event, nextRefresh),
  ]);
  return { ok: true, accessToken, refreshToken: nextRefresh, expiresIn };
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the current user session from cookies and optionally Bearer
 * headers.  Attempts to validate the existing access token, or
 * refreshes it using a refresh token when expired.  When no valid
 * session is found returns { ok: false }.
 * @param {any} event
 * @param {{ allowBearer?: boolean }} [opts]
 * @returns {Promise<{ ok: true, token: string, user: { id: string, email: string }, source: 'cookie'|'refresh'|'bearer' } | { ok: false, source: 'none' }>}
 */
async function resolveAuthSession(event, opts = {}) {
  const allowBearer = !!opts.allowBearer;
  const at = core.getCookie(event, core.ACCESS_COOKIE_NAME);
  const rt = core.getCookie(event, core.REFRESH_COOKIE_NAME);
  // Optionally consider Bearer header in non-production contexts
  const prod = core.isProdContext();
  const tok = allowBearer || !prod ? parseBearerToken(event) : '';
  let token = String(at || '').trim();
  let source = 'cookie';
  if (!token && tok) {
    token = String(tok || '').trim();
    source = 'bearer';
  }
  let r = token ? await validateToken(token) : { ok: false };
  if (!r.ok && rt) {
    const rr = await refreshAccessToken(event, rt);
    if (rr.ok && rr.accessToken) {
      token = rr.accessToken;
      source = 'refresh';
      r = await validateToken(token);
    }
  }
  if (!r.ok) return { ok: false, source: 'none' };
  return { ok: true, token, user: r.user, source };
}

// ---------------------------------------------------------------------------
// Authentication guards
//
// This RLS‑only build enforces authentication via row level security.  When
// authentication is required (based on NCS_REQUIRE_AUTH) it resolves the
// current session using cookies or bearer tokens, ensures an anonymous key
// is configured and returns a context with user and role information.  If
// authentication is disabled or a valid session cannot be resolved, it
// returns an appropriate error response.  Baseline (non‑RLS) support has
// been removed.
// ---------------------------------------------------------------------------

/**
 * Enforce authentication under RLS.  Requires the anonymous key to be
 * configured; otherwise returns a 503.  Resolves the user session via
 * cookies or bearer tokens and populates roles.  On failure returns a
 * context with a 401 response.
 *
 * @param {any} event
 * @returns {Promise<{ enabled: boolean, user: any, token: string|null, roles: string[], isAdmin: boolean, response?: any }>}
 */
async function requireAuthRls(event) {
  const enabled = core.isAuthRequired();
  if (!enabled) return { enabled: false, user: null, token: null, roles: [], isAdmin: false };
  if (!String(process.env.SUPABASE_ANON_KEY || '').trim()) {
    return {
      enabled: true,
      user: null,
      token: null,
      roles: [],
      isAdmin: false,
      response: core.json(event, 503, core.err('CONFIG', 'SUPABASE_ANON_KEY é obrigatória quando RLS está ativado.')),
    };
  }
  const prod = core.isProdContext();
  const sess = await resolveAuthSession(event, { allowBearer: !prod });
  if (!sess.ok) {
    return {
      enabled: true,
      user: null,
      token: null,
      roles: [],
      isAdmin: false,
      response: core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.')),
    };
  }
  const rolesInfo = await getUserRoles(sess.user.id, sess.token);
  return {
    enabled: true,
    user: sess.user,
    token: sess.token,
    roles: rolesInfo.roles,
    isAdmin: rolesInfo.isAdmin,
  };
}

/**
 * Build an authentication context for a given request based on the
 * request path and method.  Public routes bypass authentication;
 * sensitive routes always enforce RLS‑backed authentication.  Baseline
 * support has been removed.
 *
 * @param {any} event
 * @param {string} head
 * @param {string} method
 * @returns {Promise<{ enabled: boolean, user: any, token: string|null, roles: string[], isAdmin: boolean, response?: any }>}
 */
async function buildAuthContext(event, head, method) {
  if (!core.isSensitiveRoute(head, method)) {
    return { enabled: false, user: null, token: null, roles: [], isAdmin: false };
  }
  // RLS is always enabled; there is no baseline fallback.  Enforce
  // authentication through the RLS guard.
  return requireAuthRls(event);
}

module.exports = {
  validateToken,
  getUserRoles,
  parseBearerToken,
  refreshAccessToken,
  resolveAuthSession,
  // Only the RLS guard is exported.  Baseline support has been removed.
  requireAuthRls,
  buildAuthContext,
};