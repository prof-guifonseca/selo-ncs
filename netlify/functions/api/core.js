// netlify/functions/api/core.js
//
// This module defines a collection of foundational helpers used
// throughout the backend.  These utilities include date and JSON
// parsing helpers, HTTP method normalization, header processing,
// cookie management, CORS handling, response helpers and various
// convenience functions.  They are extracted from the former
// monolithic index.js to support a more modular architecture.

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the cookie carrying the access token. */
const ACCESS_COOKIE_NAME = 'ncs_at';
/** Name of the cookie carrying the refresh token. */
const REFRESH_COOKIE_NAME = 'ncs_rt';
/** Headers used to prevent caching of API responses. */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };
/** Default maximum age in seconds for refresh cookies (30 days). */
const DEFAULT_REFRESH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a JSON string, returning null on error.
 * @param {string} v
 * @returns {any|null}
 */
function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/**
 * Return the current timestamp in ISO 8601 format.
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/** Normalize an HTTP method into a known verb. Defaults to GET. */
function normalizeMethod(m) {
  const mm = String(m || '').toUpperCase();
  return mm === 'POST' ||
    mm === 'PUT' ||
    mm === 'PATCH' ||
    mm === 'DELETE' ||
    mm === 'OPTIONS' ||
    mm === 'HEAD'
    ? mm
    : 'GET';
}

/**
 * Normalize an object containing HTTP headers such that all keys are
 * lowercased.  Useful when comparing header names in a case-insensitive
 * fashion.
 * @param {unknown} h
 * @returns {Record<string, any>}
 */
function normalizeHeaderMap(h) {
  /** @type {Record<string, any>} */
  const out = {};
  const src = h && typeof h === 'object' ? h : {};
  for (const [k, v] of Object.entries(src)) out[String(k || '').toLowerCase()] = v;
  return out;
}

/** Decode the body of a Netlify event into a Buffer. */
function decodeBody(event) {
  const b = event && event.body != null ? event.body : '';
  if (!b) return Buffer.from('');
  return event.isBase64Encoded ? Buffer.from(String(b), 'base64') : Buffer.from(String(b), 'utf8');
}

/** Parse a JSON body from a Netlify event. */
function parseJsonBody(event) {
  const buf = decodeBody(event);
  if (!buf.length) return null;
  return safeJsonParse(buf.toString('utf8'));
}

/**
 * Parse query string parameters from a Netlify event.  This helper
 * consolidates Netlify's `queryStringParameters` with a manual
 * fallback for raw URLs.  It returns a plain object mapping keys to
 * values.  When the event includes a `queryStringParameters` object
 * that object is returned directly.  Otherwise the function
 * attempts to parse the query component of `rawUrl`.  Values are
 * returned as strings without decoding plus signs or percent
 * encoding; callers may decode if necessary.
 *
 * @param {any} event
 * @returns {Record<string, string>}
 */
function parseQuery(event) {
  const qs = event && typeof event.queryStringParameters === 'object' && event.queryStringParameters;
  if (qs && Object.keys(qs).length) {
    // Normalize keys to strings; values remain as provided.
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(qs)) out[String(k)] = String(v);
    return out;
  }
  /** @type {Record<string, string>} */
  const out = {};
  const rawUrl = String((event && event.rawUrl) || '').trim();
  const idx = rawUrl.indexOf('?');
  if (idx >= 0) {
    const query = rawUrl.slice(idx + 1);
    const params = new URLSearchParams(query);
    // Cast to any to work around missing .entries() definition on
    // URLSearchParams in the Node.js type environment.  In modern
    // runtimes URLSearchParams is iterable, but TypeScript may not
    // expose the entries() method when DOM libs are absent.  Using
    // any avoids type errors without changing behaviour.
    for (const [key, value] of /** @type {any} */ (params).entries()) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Construct a standard error payload.
 * @param {string} code
 * @param {string} message
 * @param {any} [details]
 * @returns {{ error: { code: string, message: string, details?: any } }}
 */
function err(code, message, details) {
  const e = { code: String(code || 'ERROR'), message: String(message || 'Erro') };
  if (details != null) e.details = details;
  return { error: e };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the original path of a Netlify request, honouring forwarded
 * headers if present.
 * @param {any} event
 * @returns {string}
 */
function getOriginalPath(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const cands = [
    h['x-nf-original-path'],
    h['x-original-uri'],
    h['x-forwarded-uri'],
    h['x-rewrite-url'],
    h['x-nf-original-url'],
  ].filter(Boolean);
  const raw = String(cands[0] || event.path || '').trim();
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return new URL(raw).pathname;
  } catch {}
  return raw;
}

/** Derive the sub-path (the portion after /.netlify/functions/api) from a Netlify event. */
function getSubPath(event) {
  let p = String(getOriginalPath(event) || '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  const fnPrefix = '/.netlify/functions/api';
  if (p.startsWith(fnPrefix)) p = p.slice(fnPrefix.length);
  if (p.startsWith('/api')) p = p.slice('/api'.length);
  return p || '/';
}

/** Split a URL path into its segments, stripping query and hash fragments. */
function splitPath(p) {
  const clean = String(p || '').trim().replace(/\?.*$/, '').replace(/#.*$/, '');
  return clean
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/** Whether authentication is required for sensitive routes. */
function isAuthRequired() {
  return String(process.env.NCS_REQUIRE_AUTH || '1').trim() !== '0';
}

/** Whether row level security (RLS) is enabled. */
/**
 * Enforce RLS-only mode.  Returns `true` always to indicate that row level
 * security is required for all operations.  The previous implementation
 * allowed a fallback when `NCS_USE_RLS` was set to `'0'`, emitting a log
 * and silently disabling RLS.  That behaviour has been removed: the
 * backend no longer supports a non-RLS mode.  Any attempt to disable RLS
 * via environment variables should be caught early via `requireRlsOnly()`.
 *
 * @returns {boolean} Always `true`.
 */
function isRlsEnabled() {
  return true;
}

/**
 * Hard gate that aborts request handling when RLS has been explicitly
 * disabled via `NCS_USE_RLS=0`, `false` or `no`.  This guard should be
 * invoked at the beginning of the request pipeline (e.g. in the API
 * router) to fail fast on misconfiguration.  It inspects the environment
 * variable once per request and returns a Netlify response when
 * misconfigured, otherwise it returns `null` to allow normal processing.
 *
 * @param {any} event Netlify event
 * @returns {any|null} Response object when misconfigured or `null` otherwise
 */
function requireRlsOnly(event) {
  const raw = process.env.NCS_USE_RLS;
  if (raw != null) {
    const val = String(raw).trim().toLowerCase();
    if (val === '0' || val === 'false' || val === 'no') {
      // Fail fast: RLS cannot be disabled.  Return a 503 response with a
      // deterministic error code signalling misconfiguration.  We use
      // `json()` instead of throwing so callers can simply return this
      // value to abort processing.
      return json(
        event,
        503,
        err('MISCONFIG_RLS_DISABLED', 'RLS desativado. Defina NCS_USE_RLS=1 ou remova a variável.'),
        {},
        []
      );
    }
  }
  return null;
}

/** Determine if the current Netlify context is production. */
function isProdContext() {
  // Define “produção” com base nos contextos padrão do Netlify ou Node.js.
  // A flag NCS_FORCE_PROD_CONTEXT foi removida para evitar múltiplas fontes de
  // verdade.  Considere definir NETLIFY_CONTEXT, CONTEXT ou NODE_ENV
  // adequadamente no ambiente de deploy.
  const a = String(process.env.NETLIFY_CONTEXT || '').toLowerCase();
  const b = String(process.env.CONTEXT || '').toLowerCase();
  const c = String(process.env.NODE_ENV || '').toLowerCase();
  return a === 'production' || b === 'production' || c === 'production';
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/** Normalize an origin value by trimming and removing trailing slashes. */
function normalizeOriginValue(v) {
  const s = String(v || '').trim();
  return s ? s.replace(/\/+$/g, '') : '';
}

/** Compute the API origin (scheme + host) from the request. */
function apiOrigin(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const proto = String(h['x-forwarded-proto'] || 'https').trim();
  const host = String(h.host || '').trim();
  return host ? `${proto}://${host}` : '';
}

/** Determine which origin to set for CORS based on configuration and request. */
function resolveCorsOrigin(event) {
  const cfgRaw = String(process.env.NCS_CORS_ORIGIN || '*').trim();
  const h = normalizeHeaderMap(event.headers || {});
  const reqOrigin = normalizeOriginValue(h.origin || '');
  const api = normalizeOriginValue(apiOrigin(event));
  if (cfgRaw === '*') {
    // In credentialed requests, '*' cannot be used when Origin is present.
    // Instead, reflect the request origin when available.
    return reqOrigin || api || '*';
  }
  const allow = cfgRaw
    .split(',')
    .map((s) => normalizeOriginValue(s))
    .filter(Boolean);
  if (!allow.length) return reqOrigin || api || '*';
  if (reqOrigin && allow.includes(reqOrigin)) return reqOrigin;
  // Conservative fallback: use the first configured origin.
  return allow[0];
}

/** Build the CORS headers for a response. */
function corsHeaders(event) {
  const origin = resolveCorsOrigin(event);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'x-ncs-request-id',
    Vary: 'Origin',
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique request ID from standard forwarded headers or fall back
 * to a random UUID.  This ID is included in responses to facilitate
 * troubleshooting across distributed systems.
 * @param {any} event
 * @returns {string}
 */
function getRequestId(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const fromHeader = String(h['x-nf-request-id'] || h['x-request-id'] || h['x-amzn-trace-id'] || '').trim();
  return fromHeader || crypto.randomUUID();
}

/** Deduplicate Set-Cookie headers by cookie name, keeping the last occurrence. */
function dedupeSetCookies(cookies) {
  const out = [];
  const seen = new Map(); // name -> index in out
  for (const raw of cookies) {
    const c = String(raw || '').trim();
    if (!c) continue;
    const name = c.split('=')[0].trim();
    if (!name) {
      out.push(c);
      continue;
    }
    if (seen.has(name)) {
      const idx = seen.get(name);
      out.splice(idx, 1);
      for (const [k, v] of seen.entries()) if (v > idx) seen.set(k, v - 1);
    }
    out.push(c);
    seen.set(name, out.length - 1);
  }
  return out;
}

/** Accumulate cookies to be set on the event for later inclusion in the response. */
function pushSetCookies(event, cookies) {
  if (!event) return;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  // @ts-ignore – internal state property
  event.__ncs_set_cookies = Array.isArray(event.__ncs_set_cookies) ? event.__ncs_set_cookies : [];
  // @ts-ignore
  for (const c of list) if (c) event.__ncs_set_cookies.push(String(c));
}

/** Collect cookies accumulated during request processing and merge with explicit cookies. */
function collectSetCookies(event, setCookies) {
  // @ts-ignore
  const auto = event && Array.isArray(event.__ncs_set_cookies) ? event.__ncs_set_cookies : [];
  const explicit = Array.isArray(setCookies) ? setCookies : [];
  return dedupeSetCookies([...auto, ...explicit].filter(Boolean));
}

/**
 * Build a Netlify response with the given status code, content type and
 * body.  Automatically attaches CORS headers, no-store headers, a
 * request ID and any accumulated cookies.  Extra headers may be
 * supplied via the extraHeaders argument.  Cookies can be provided
 * explicitly via setCookies.
 * @param {any} event
 * @param {number} statusCode
 * @param {string} contentType
 * @param {string} body
 * @param {Record<string, string>} [extraHeaders]
 * @param {string[]} [setCookies]
 * @returns {any}
 */
function respond(event, statusCode, contentType, body, extraHeaders = {}, setCookies = []) {
  const headers = Object.assign(
    { 'Content-Type': contentType },
    NO_STORE_HEADERS,
    corsHeaders(event),
    extraHeaders || {}
  );
  const rid = event && event.__ncs_request_id ? String(event.__ncs_request_id) : '';
  if (rid && !Object.keys(headers).some((k) => k.toLowerCase() === 'x-ncs-request-id')) {
    headers['x-ncs-request-id'] = rid;
  }
  /** @type {any} */
  const res = { statusCode, headers, body: body || '' };
  const cookies = collectSetCookies(event, setCookies);
  if (cookies.length === 1) {
    res.headers['Set-Cookie'] = cookies[0];
  } else if (cookies.length > 1) {
    res.multiValueHeaders = res.multiValueHeaders || {};
    res.multiValueHeaders['Set-Cookie'] = cookies;
  }
  return res;
}

/** Build a JSON response. */
function json(event, statusCode, obj, extraHeaders = {}, setCookies = []) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return respond(event, statusCode, 'application/json; charset=utf-8', body, extraHeaders, setCookies);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Parse a Cookie header string into a key/value map. */
function parseCookieHeader(header) {
  /** @type {Record<string, string>} */
  const out = {};
  const raw = String(header || '');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Retrieve a cookie value by name from a Netlify event. */
function getCookie(req, name) {
  const headers = req && typeof req === 'object' && 'headers' in req ? req.headers : req;
  const h = normalizeHeaderMap(headers || {});
  const cookies = parseCookieHeader(h.cookie || '');
  return String(cookies[name] || '').trim();
}

/** Serialize a cookie into a Set-Cookie header value. */
function serializeCookie(name, value, opts = {}) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(String(value || ''))}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (typeof opts.maxAge === 'number' && Number.isFinite(opts.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  }
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

/** Determine if a request is cross-origin by comparing Origin and API origin. */
function isCrossOrigin(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const origin = String(h.origin || '').trim();
  const api = apiOrigin(event);
  return !!(origin && api && origin !== api);
}

/** Determine if a request is over HTTPS. */
function isHttpsRequest(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const proto = String(h['x-forwarded-proto'] || '').trim().toLowerCase();
  if (proto) return proto === 'https';
  const o = apiOrigin(event);
  return o.startsWith('https://');
}

/** Normalize a SameSite value. */
function normalizeSameSite(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.toLowerCase();
  if (m === 'none') return 'None';
  if (m === 'lax') return 'Lax';
  if (m === 'strict') return 'Strict';
  return '';
}

/** Parse a boolean environment variable. */
function parseBoolEnv(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (s === '1' || s.toLowerCase() === 'true') return true;
  if (s === '0' || s.toLowerCase() === 'false') return false;
  return null;
}

/**
 * Compute the max-age for refresh cookies.  Bounded between 60 seconds
 * (1 minute) and 365 days.
 */
function getRefreshCookieMaxAgeSeconds() {
  const raw = String(process.env.NCS_REFRESH_COOKIE_MAX_AGE || '').trim();
  const n = raw ? Number(raw) : NaN;
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_REFRESH_COOKIE_MAX_AGE_SEC;
  return Math.max(60, Math.min(60 * 60 * 24 * 365, v));
}

/** Determine the SameSite and Secure attributes for cookies based on policy. */
function resolveCookiePolicy(event) {
  const cross = isCrossOrigin(event);
  const https = isHttpsRequest(event);
  const sameSiteEnv = normalizeSameSite(process.env.NCS_COOKIE_SAMESITE);
  let sameSite = sameSiteEnv || (cross ? 'None' : 'Lax');
  const secureOverride = parseBoolEnv(process.env.NCS_COOKIE_SECURE);
  let secure = secureOverride == null ? https : secureOverride;
  // Browsers require Secure when SameSite=None and only over HTTPS.
  if (sameSite === 'None' && !https) sameSite = 'Lax';
  if (sameSite === 'None') secure = true;
  return { sameSite: /** @type {any} */ (sameSite), secure: !!secure };
}

/** Build a Set-Cookie header for the access token cookie. */
function buildAccessCookie(event, accessToken, expiresInSec) {
  const { sameSite, secure } = resolveCookiePolicy(event);
  const maxAge = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : undefined;
  return serializeCookie(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge,
  });
}

/** Build a Set-Cookie header for the refresh token cookie. */
function buildRefreshCookie(event, refreshToken, maxAgeSec) {
  const { sameSite, secure } = resolveCookiePolicy(event);
  const maxAge = Number.isFinite(maxAgeSec) && maxAgeSec > 0 ? Math.floor(maxAgeSec) : getRefreshCookieMaxAgeSeconds();
  return serializeCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge,
  });
}

/** Clear the access token cookie. */
function clearAccessCookie(event) {
  const { sameSite, secure } = resolveCookiePolicy(event);
  return serializeCookie(ACCESS_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 0,
  });
}

/** Clear the refresh token cookie. */
function clearRefreshCookie(event) {
  const { sameSite, secure } = resolveCookiePolicy(event);
  return serializeCookie(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 0,
  });
}

/** Clear both access and refresh cookies. */
function clearAuthCookies(event) {
  return [clearAccessCookie(event), clearRefreshCookie(event)];
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/** Determine if a route is considered public (no auth required). */
function isPublicRoute(head, method) {
  const h = String(head || '').trim();
  const m = String(method || '').toUpperCase();
  if (h === 'auth') return true;
  if (h === 'public-pages' && (m === 'GET' || m === 'HEAD')) return true;
  if (h === 'health' && (m === 'GET' || m === 'HEAD')) return true;
  return false;
}

/** Any route that is not public is considered sensitive. */
function isSensitiveRoute(head, method) {
  return !isPublicRoute(head, method);
}

// ---------------------------------------------------------------------------
// Misc utilities
// ---------------------------------------------------------------------------

/** Obtain the client IP address from standard headers. */
function getClientIp(event) {
  const h = normalizeHeaderMap(event.headers || {});
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(h['x-nf-client-connection-ip'] || '').trim() || 'unknown';
}

/**
 * Rate limiter for login attempts.  Maintains an in-memory bucket of
 * attempts keyed by IP and email.  Applies a sliding window of 60
 * seconds and limits to the configured NCS_LOGIN_RATE_LIMIT.  When
 * the limit is exceeded, returns false.
 * @param {any} event
 * @param {string} email
 * @returns {boolean}
 */
const _loginRateBuckets = new Map();
function allowLoginAttempt(event, email) {
  const ip = getClientIp(event);
  const em = String(email || '').trim().toLowerCase();
  const key = `${ip}:${em || 'unknown'}`;
  const now = Date.now();
  const windowMs = 60_000;
  const maxHits = Number(process.env.NCS_LOGIN_RATE_LIMIT || 8) || 8;
  const cur = _loginRateBuckets.get(key) || { reset: now + windowMs, hits: 0 };
  if (now > cur.reset) {
    cur.reset = now + windowMs;
    cur.hits = 0;
  }
  cur.hits += 1;
  _loginRateBuckets.set(key, cur);
  return cur.hits <= maxHits;
}

/** Ensure a non-empty textual ID, optionally prefixing with a given string. */
function ensureTextId(x, prefix = '') {
  const s = String(x || '').trim();
  if (s) return s;
  return prefix ? `${prefix}_${crypto.randomUUID()}` : crypto.randomUUID();
}

/** Slugify a string loosely for use in URLs. */
function slugifyLoose(input) {
  const s = String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'empresa';
}

/** Sanitize a public payload by standardising company and level fields. */
function sanitizePublicPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  /** @type {Record<string, any>} */
  const out = {};
  const company = p.company_name || p.companyName || p.empresa || p.nome_empresa || p.name || p.company || 'Empresa';
  const level = p.level || p.nivel || p.level_name || p.status_level || null;
  out.company_name = String(company || 'Empresa');
  if (level != null) out.level = level;
  if (p.issued_at || p.issuedAt) out.issued_at = p.issued_at || p.issuedAt;
  if (p.expires_at || p.expiresAt) out.expires_at = p.expires_at || p.expiresAt;
  if (p.verified_at || p.verifiedAt) out.verified_at = p.verified_at || p.verifiedAt;
  return out;
}

/** Determine whether an email matches a configured allowlist. */
function emailMatchesList(email, listEnv) {
  const e = String(email || '').trim().toLowerCase();
  const raw = String(listEnv || '').trim().toLowerCase();
  if (!e || !raw) return false;
  const items = raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const it of items) {
    if (it.startsWith('@')) {
      // domain match
      if (e.endsWith(it)) return true;
      continue;
    }
    if (e === it) return true;
  }
  return false;
}

/** Infer a role based on admin/auditor allowlists defined in env vars. */
function inferRoleFromAllowlist(email) {
  // Este helper anteriormente inferia papéis (admin/auditor) a partir de listas de emails
  // configuradas via `NCS_ADMIN_EMAILS` e `NCS_AUDITOR_EMAILS`.  Para simplificar a
  // configuração e evitar variáveis extras, a inferência foi desativada: a
  // função sempre retorna uma string vazia.  Papéis devem ser definidos via
  // memberships no Supabase ou por outros mecanismos explícitos.
  return '';
}

// ---------------------------------------------------------------------------
// Multipart parsing
// ---------------------------------------------------------------------------

/** Split a buffer on a separator into an array of Buffers. */
function splitBuffer(buf, sep) {
  const out = [];
  let start = 0;
  while (start <= buf.length) {
    const idx = buf.indexOf(sep, start);
    if (idx === -1) {
      out.push(buf.slice(start));
      break;
    }
    out.push(buf.slice(start, idx));
    start = idx + sep.length;
  }
  return out;
}

/** Parse a multipart/form-data request body into fields and files. */
function parseMultipart(event) {
  try {
    const h = normalizeHeaderMap(event.headers || {});
    const ct = String(h['content-type'] || '');
    const m = ct.match(/boundary=([^;]+)/i);
    if (!m) return { fields: {}, files: {}, error: new Error('missing boundary') };
    const boundary = String(m[1]).trim().replace(/^"|"$/g, '');
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const bodyBuf = decodeBody(event);
    const parts = splitBuffer(bodyBuf, boundaryBuf).filter((p) => p && p.length);
    /** @type {Record<string, string>} */
    const fields = {};
    /** @type {Record<string, { filename: string, contentType: string, data: Buffer }>} */
    const files = {};
    for (const rawPart of parts) {
      let part = rawPart;
      if (part.slice(0, 2).toString('latin1') === '\r\n') part = part.slice(2);
      if (part.slice(0, 2).toString('latin1') === '--') continue;
      const headerEnd = part.indexOf(Buffer.from('\r\r\n'));
      if (headerEnd === -1) continue;
      const headerTxt = part.slice(0, headerEnd).toString('utf8');
      let content = part.slice(headerEnd + 4);
      if (content.slice(-2).toString('latin1') === '\r\n') content = content.slice(0, -2);
      /** @type {Record<string, string>} */
      const headers = {};
      for (const line of headerTxt.split(/\r\n/)) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      }
      const disp = String(headers['content-disposition'] || '');
      const nameMatch = disp.match(/\bname="([^\"]+)"/i);
      const fileMatch = disp.match(/\bfilename="([^\"]*)"/i);
      const fieldName = nameMatch ? nameMatch[1] : '';
      if (!fieldName) continue;
      if (fileMatch) {
        files[fieldName] = {
          filename: fileMatch[1] || 'file',
          contentType: String(headers['content-type'] || 'application/octet-stream'),
          data: content,
        };
      } else {
        fields[fieldName] = content.toString('utf8');
      }
    }
    return { fields, files };
  } catch (e) {
    return { fields: {}, files: {}, error: /** @type {Error} */ (e) };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // constants
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  NO_STORE_HEADERS,
  DEFAULT_REFRESH_COOKIE_MAX_AGE_SEC,
  // basic helpers
  safeJsonParse,
  nowIso,
  normalizeMethod,
  normalizeHeaderMap,
  decodeBody,
  parseJsonBody,
  parseQuery,
  err,
  // path helpers
  getOriginalPath,
  getSubPath,
  splitPath,
  // flags
  isAuthRequired,
  isRlsEnabled,
  isProdContext,
  // enforce RLS-only
  requireRlsOnly,
  // CORS
  normalizeOriginValue,
  apiOrigin,
  resolveCorsOrigin,
  corsHeaders,
  // response
  getRequestId,
  dedupeSetCookies,
  pushSetCookies,
  collectSetCookies,
  respond,
  json,
  // cookies
  parseCookieHeader,
  getCookie,
  serializeCookie,
  isCrossOrigin,
  isHttpsRequest,
  normalizeSameSite,
  parseBoolEnv,
  getRefreshCookieMaxAgeSeconds,
  resolveCookiePolicy,
  buildAccessCookie,
  buildRefreshCookie,
  clearAccessCookie,
  clearRefreshCookie,
  clearAuthCookies,
  // route classification
  isPublicRoute,
  isSensitiveRoute,
  // misc
  getClientIp,
  allowLoginAttempt,
  ensureTextId,
  slugifyLoose,
  sanitizePublicPayload,
  emailMatchesList,
  inferRoleFromAllowlist,
  splitBuffer,
  parseMultipart,
};