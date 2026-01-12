// netlify/functions/api/supabase.js
//
// This module encapsulates all low level interactions with the Supabase
// HTTP API.  It provides fetch helpers for different authentication
// contexts (service role, anonymous, user scoped) as well as thin
// wrappers around common PostgREST and Storage operations.
//
// IMPORTANT (RLS-only):
// - RLS protege o acesso vindo do cliente (anon/user JWT).
// - Netlify Functions são servidor-trusted e podem usar SERVICE_ROLE para
//   operações necessárias (ex.: provisionamento: companies/memberships),
//   desde que as rotas sejam cuidadosamente implementadas e não exponham
//   endpoints genéricos de leitura/admin ao cliente.

'use strict';

const crypto = require('crypto');

function _hasServiceRole() {
  return !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function _assertServiceRole() {
  // When row‑level security (RLS) is enabled the service role helpers must not
  // be used.  To enforce this policy we inspect NCS_USE_RLS and, when
  // active, throw a deterministic error before any network request is
  // attempted.  This guard is essential to avoid accidental bypasses of
  // tenant isolation in RLS mode.  See scripts/smoke_backend.mjs for the
  // corresponding smoke test.  The environment variable must be treated
  // consistently with other modules: any value other than '0', 'false' or
  // 'no' means RLS is enabled.
  const raw = process.env.NCS_USE_RLS;
  if (raw != null) {
    const val = String(raw).trim().toLowerCase();
    if (val !== '0' && val !== 'false' && val !== 'no') {
      throw new Error('ADMIN_HELPER_DISABLED_RLS');
    }
  }
  if (!_hasServiceRole()) throw new Error('SERVICE_ROLE_MISSING');
}

/**
 * Generic fetch against the Supabase REST API.
 * @param {string} apiKey
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string,string>, body?: any }} [init]
 * @returns {Promise<{ ok: boolean, status: number, data: any, headers: Record<string, string> }>}
 */
async function supabaseFetchRaw(apiKey, path, init = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/g, '');
  const key = String(apiKey || '').trim();
  if (!base || !key) return { ok: false, status: 503, data: null, headers: {} };

  const url = `${base}${String(path || '')}`;

  /** @type {Record<string, string>} */
  const headers = Object.assign({ apikey: key }, init.headers || {});
  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (!hasAuth) headers.Authorization = `Bearer ${key}`;

  let body = init.body;
  const method = String(init.method || 'GET').toUpperCase();

  if (
    body &&
    typeof body === 'object' &&
    !Buffer.isBuffer(body) &&
    !(body instanceof Uint8Array) &&
    typeof body !== 'string'
  ) {
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    body = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body });

  /** @type {Record<string,string>} */
  const outHeaders = {};
  try {
    for (const [k, v] of res.headers.entries()) outHeaders[String(k).toLowerCase()] = String(v);
  } catch {}

  const ct = String(res.headers.get('content-type') || '');
  let data = null;
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  return { ok: res.ok, status: res.status, data, headers: outHeaders };
}

/**
 * Fetch as a service role.
 * @param {string} path
 * @param {any} [init]
 */
function supabaseFetchAdmin(path, init = {}) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return supabaseFetchRaw(key, path, init);
}

/**
 * Fetch as an authenticated user (RLS).
 * @param {string} jwt
 * @param {string} path
 * @param {any} [init]
 */
function supabaseFetchUser(jwt, path, init = {}) {
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const token = String(jwt || '').trim();
  if (!anon || !token) return Promise.resolve({ ok: false, status: 401, data: null, headers: {} });
  const headers = Object.assign({}, init.headers || {}, { Authorization: `Bearer ${token}` });
  return supabaseFetchRaw(anon, path, Object.assign({}, init, { headers }));
}

/**
 * Fetch anonymously using the SUPABASE_ANON_KEY.
 * @param {string} path
 * @param {any} [init]
 */
function supabaseFetchAnon(path, init = {}) {
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!anon) return Promise.resolve({ ok: false, status: 503, data: null, headers: {} });
  return supabaseFetchRaw(anon, path, init);
}

/**
 * Fetch for authentication flows.
 * @param {string} path
 * @param {any} [init]
 */
function supabaseFetchAuth(path, init = {}) {
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (anon) return supabaseFetchRaw(anon, path, init);
  return supabaseFetchAdmin(path, init);
}

/* ------------------------------------------------------------------------ */
/*                           PostgREST helpers                              */
/* ------------------------------------------------------------------------ */

function restPath(table, query = '') {
  const q = query && String(query).startsWith('?') ? query : query ? `?${query}` : '';
  return `/rest/v1/${encodeURIComponent(table)}${q}`;
}

function pgrstObjectHeader() {
  return { Accept: 'application/vnd.pgrst.object+json' };
}

/** Select a single row with service role privileges. */
async function restSelectObjectAdmin(table, query, opts = {}) {
  _assertServiceRole();
  const allow404 = opts.allow404 !== false;
  const r = await supabaseFetchAdmin(restPath(table, query), { method: 'GET', headers: pgrstObjectHeader() });
  if (!r.ok) {
    if (allow404 && (r.status === 406 || r.status === 404)) return null;
    throw new Error(`postgrest_admin_select_failed:${table}:${r.status}`);
  }
  return r.data || null;
}

/** Select a list of rows with service role privileges. */
async function restSelectListAdmin(table, query) {
  _assertServiceRole();
  const r = await supabaseFetchAdmin(restPath(table, query), { method: 'GET' });
  if (!r.ok) throw new Error(`postgrest_admin_list_failed:${table}:${r.status}`);
  return Array.isArray(r.data) ? r.data : [];
}

/** Select a single row under user RLS. */
async function restSelectObjectUser(jwt, table, query, opts = {}) {
  const allow404 = opts.allow404 !== false;
  const r = await supabaseFetchUser(jwt, restPath(table, query), { method: 'GET', headers: pgrstObjectHeader() });
  if (!r.ok) {
    if (allow404 && (r.status === 406 || r.status === 404)) return null;
    throw new Error(`postgrest_user_select_failed:${table}:${r.status}`);
  }
  return r.data || null;
}

/** Select a list of rows under user RLS. */
async function restSelectListUser(jwt, table, query) {
  const r = await supabaseFetchUser(jwt, restPath(table, query), { method: 'GET' });
  if (!r.ok) throw new Error(`postgrest_user_list_failed:${table}:${r.status}`);
  return Array.isArray(r.data) ? r.data : [];
}

/** Select a single row anonymously. */
async function restSelectObjectAnon(table, query, opts = {}) {
  const allow404 = opts.allow404 !== false;
  const r = await supabaseFetchAnon(restPath(table, query), { method: 'GET', headers: pgrstObjectHeader() });
  if (!r.ok) {
    if (allow404 && (r.status === 406 || r.status === 404)) return null;
    throw new Error(`postgrest_anon_select_failed:${table}:${r.status}`);
  }
  return r.data || null;
}

/** Select a list of rows anonymously. */
async function restSelectListAnon(table, query) {
  const r = await supabaseFetchAnon(restPath(table, query), { method: 'GET' });
  if (!r.ok) throw new Error(`postgrest_anon_list_failed:${table}:${r.status}`);
  return Array.isArray(r.data) ? r.data : [];
}

/** Upsert a row under user RLS. */
async function restUpsertUser(jwt, table, row, options = {}) {
  const onConflict = String(options.onConflict || 'id');
  const r = await supabaseFetchUser(jwt, restPath(table, `on_conflict=${encodeURIComponent(onConflict)}`), {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [row],
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.data || null };
  const outRow = Array.isArray(r.data) ? r.data[0] || null : r.data || null;
  return { ok: true, status: r.status, row: outRow };
}

/** Upsert a row with service role privileges. */
async function restUpsertAdmin(table, row, options = {}) {
  _assertServiceRole();
  const onConflict = String(options.onConflict || 'id');
  const r = await supabaseFetchAdmin(restPath(table, `on_conflict=${encodeURIComponent(onConflict)}`), {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [row],
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.data || null };
  const outRow = Array.isArray(r.data) ? r.data[0] || null : r.data || null;
  return { ok: true, status: r.status, row: outRow };
}

/** Delete rows under user RLS. */
async function restDeleteUser(jwt, table, query) {
  const r = await supabaseFetchUser(jwt, restPath(table, query), {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.data || null, deletedCount: 0 };
  return { ok: true, status: r.status, deletedCount: Array.isArray(r.data) ? r.data.length : 0 };
}

/** Delete rows with service role privileges. */
async function restDeleteAdmin(table, query) {
  _assertServiceRole();
  const r = await supabaseFetchAdmin(restPath(table, query), {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.data || null, deletedCount: 0 };
  return { ok: true, status: r.status, deletedCount: Array.isArray(r.data) ? r.data.length : 0 };
}

/* ------------------------------------------------------------------------ */
/*                             Storage helpers                              */
/* ------------------------------------------------------------------------ */

function safeObjectKey(evidenceId) {
  const base = String(evidenceId || '').trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return `evidences/${cleaned || crypto.randomUUID()}`;
}

function encodePathSegments(p) {
  return String(p || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Create a signed upload URL using the service role key. */
async function createSignedUploadUrlAdmin(bucket, objectKey, expiresInSeconds = 600) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw new Error('missing env');
  const signUrl = `${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodePathSegments(objectKey)}`;
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`storage sign upload HTTP ${res.status}`);
  const payload = await res.json().catch(() => null);
  let u = payload && (payload.signedUrl || payload.signedURL || payload.url);
  if (!u && payload && payload.data) u = payload.data.signedUrl || payload.data.signedURL || payload.data.url;
  if (!u) throw new Error('storage sign upload missing signedUrl');
  const s = String(u);
  return s.startsWith('/') ? `${base}${s}` : s;
}

/** Create a signed download URL using the service role key. */
async function createSignedDownloadUrlAdmin(bucket, objectKey, expiresInSeconds = 600) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw new Error('missing env');
  const signUrl = `${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodePathSegments(objectKey)}`;
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`storage sign download HTTP ${res.status}`);
  const payload = await res.json().catch(() => null);
  let u = payload && (payload.signedUrl || payload.signedURL || payload.url);
  if (!u && payload && payload.data) u = payload.data.signedUrl || payload.data.signedURL || payload.data.url;
  if (!u) throw new Error('storage sign download missing signedUrl');
  const s = String(u);
  return s.startsWith('/') ? `${base}${s}` : s;
}

/** Create a signed upload URL preferring the service role and falling back to user JWT. */
async function createSignedUploadUrl(bucket, objectKey, expiresInSeconds, jwt) {
  // Mantido: preferir service role só quando RLS for explicitamente desligado (política atual do repo)
  const hasSrv = !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const rls = String(process.env.NCS_USE_RLS || '1').trim() !== '0';
  if (hasSrv && !rls) return createSignedUploadUrlAdmin(bucket, objectKey, expiresInSeconds);

  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const token = String(jwt || '').trim();
  if (!base || !anon || !token) throw new Error('missing env');

  const signUrl = `${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodePathSegments(objectKey)}`;
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`storage sign upload HTTP ${res.status}`);
  const payload = await res.json().catch(() => null);
  let u = payload && (payload.signedUrl || payload.signedURL || payload.url);
  if (!u && payload && payload.data) u = payload.data.signedUrl || payload.data.signedURL || payload.data.url;
  if (!u) throw new Error('storage sign upload missing signedUrl');
  const s = String(u);
  return s.startsWith('/') ? `${base}${s}` : s;
}

/** Create a signed download URL preferring the service role and falling back to user JWT. */
async function createSignedDownloadUrl(bucket, objectKey, expiresInSeconds, jwt) {
  // Mantido: preferir service role só quando RLS for explicitamente desligado (política atual do repo)
  const hasSrv = !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const rls = String(process.env.NCS_USE_RLS || '1').trim() !== '0';
  if (hasSrv && !rls) return createSignedDownloadUrlAdmin(bucket, objectKey, expiresInSeconds);

  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const token = String(jwt || '').trim();
  if (!base || !anon || !token) throw new Error('missing env');

  const signUrl = `${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodePathSegments(objectKey)}`;
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`storage sign download HTTP ${res.status}`);
  const payload = await res.json().catch(() => null);
  let u = payload && (payload.signedUrl || payload.signedURL || payload.url);
  if (!u && payload && payload.data) u = payload.data.signedUrl || payload.data.signedURL || payload.data.url;
  if (!u) throw new Error('storage sign download missing signedUrl');
  const s = String(u);
  return s.startsWith('/') ? `${base}${s}` : s;
}

/** Upload binary data using the service role key. */
async function storageUploadAdmin(bucket, objectKey, data, opts = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw new Error('missing env');
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePathSegments(objectKey)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: Object.assign(
      {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': String(opts.contentType || 'application/octet-stream'),
      },
      opts.upsert ? { 'x-upsert': 'true' } : {}
    ),
    body: data,
  });
  if (!res.ok) throw new Error(`storage upload HTTP ${res.status}`);
  return true;
}

/** Remove objects from a bucket using the service role key. */
async function storageRemoveAdmin(bucket, objectKeys) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw new Error('missing env');
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: objectKeys.map(String) }),
  });
  if (!res.ok) throw new Error(`storage remove HTTP ${res.status}`);
  return true;
}

module.exports = {
  supabaseFetchRaw,
  supabaseFetchAdmin,
  supabaseFetchUser,
  supabaseFetchAnon,
  supabaseFetchAuth,
  restSelectObjectAdmin,
  restSelectListAdmin,
  restSelectObjectUser,
  restSelectListUser,
  restSelectObjectAnon,
  restSelectListAnon,
  restUpsertUser,
  restUpsertAdmin,
  restDeleteUser,
  restDeleteAdmin,
  safeObjectKey,
  encodePathSegments,
  createSignedUploadUrlAdmin,
  createSignedDownloadUrlAdmin,
  createSignedUploadUrl,
  createSignedDownloadUrl,
  storageUploadAdmin,
  storageRemoveAdmin,
  restPath,
};
