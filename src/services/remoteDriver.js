/**
 * @file src/services/remoteDriver.js
 * @module services/remoteDriver
 * @description Driver HTTP para o backend (/api/*) via Netlify Functions, com sessão por cookie HttpOnly.
 *
 * - Cookie-first (credentials: 'include') — NÃO usa localStorage/sessionStorage.
 * - Normaliza base e path para evitar duplicação de /api.
 * - Erros HTTP com parse defensivo do corpo.
 * - Compatibilidade admin: companies meta vs metadata (sem quebrar front).
 */

// Budget: 951 linhas — atualize ao modificar (evita inchaço)
/* ==========================================================================
  Types (JSDoc)
============================================================================ */

/**
 * @typedef {Record<string, string>} HeadersMap
 */

/**
 * @typedef {'json'|'text'|'blob'|'none'} ResponseType
 */

/**
 * @typedef {Object} RequestOptions
 * @property {any} [json] Corpo JSON (será serializado).
 * @property {BodyInit|null} [body] Corpo bruto (FormData/Blob/string). Ignorado se `json` for definido.
 * @property {HeadersMap} [headers] Headers adicionais.
 * @property {AbortSignal} [signal] AbortSignal externo.
 * @property {number} [timeoutMs] Timeout em ms (opcional).
 * @property {ResponseType} [responseType] Tipo de resposta (default: 'json').
 */

/**
 * @typedef {Error & {
 *   status?: number,
 *   code?: string,
 *   body?: any,
 *   url?: string,
 *   method?: string
 * }} HttpError
 */

/* ==========================================================================
  Base + helpers
============================================================================ */

const API_PREFIX = '/api';

/**
 * @returns {any}
 */
function getGlobal() {
  // eslint-disable-next-line no-undef
  return typeof window !== 'undefined' ? window : globalThis;
}

/**
 * Base do backend.
 *
 * Aceita:
 * - "" (vazio) -> usa "/api" na mesma origem
 * - "/api" ou "https://site.com/api" -> não duplica prefixo
 * - "https://site.com" -> usa "https://site.com/api"
 *
 * @returns {string}
 */
function getApiBase() {
  const g = getGlobal();
  const raw = g && g.NCS_API_BASE != null ? String(g.NCS_API_BASE) : '';
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Normaliza o path para não duplicar "/api".
 * @param {string} path
 * @returns {string}
 */
function normalizeApiPath(path) {
  let p = String(path || '').trim();
  if (!p) p = '/';
  if (!p.startsWith('/')) p = `/${p}`;

  // Permite callers passarem "/api/..." sem duplicar.
  if (p === API_PREFIX) return '/';
  if (p.startsWith(`${API_PREFIX}/`)) return p.slice(API_PREFIX.length) || '/';
  return p;
}

/**
 * @param {string} path Ex.: "/auth/me"
 * @returns {string}
 */
function apiUrl(path) {
  const base = getApiBase();
  const p = normalizeApiPath(path);

  if (!base) return `${API_PREFIX}${p}`;
  if (base.endsWith(API_PREFIX)) return `${base}${p}`;
  return `${base}${API_PREFIX}${p}`;
}

/**
 * @param {string} text
 * @returns {any}
 */
function tryParseJson(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}

/**
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function readBodyAsJsonLike(res) {
  const text = await res.text();
  if (!text) return null;

  // Se vier JSON mesmo sem content-type, ainda tentamos parsear.
  return tryParseJson(text);
}

/**
 * Extrai mensagem/código de erro de payloads comuns:
 * - { error: { code, message, details, error_description } }
 * - { error: "..." }
 * - { message: "..." }
 * - { errors: [...] }
 * - { raw: "<html>..." }
 *
 * @param {any} body
 * @param {number} status
 * @returns {{ code?: string, message: string }}
 */
function extractError(body, status) {
  const fallback = `HTTP ${status}`;

  if (!body || typeof body !== 'object') return { message: fallback };

  if (Array.isArray(body.errors) && body.errors.length) {
    const first = body.errors[0];
    if (typeof first === 'string') return { message: first || fallback };
    if (first && typeof first === 'object') {
      const msg = first.message != null ? String(first.message) : JSON.stringify(first);
      return { message: msg || fallback };
    }
  }

  if (body.error && typeof body.error === 'object') {
    const code = body.error.code != null ? String(body.error.code) : undefined;
    const msg =
      body.error.message != null
        ? String(body.error.message)
        : body.error.error_description != null
          ? String(body.error.error_description)
          : fallback;
    return { code, message: msg || fallback };
  }

  if (typeof body.error === 'string') return { message: body.error || fallback };

  if (typeof body.message === 'string') return { message: body.message || fallback };

  if (body.message && typeof body.message === 'object') {
    const msg =
      body.message.message != null
        ? String(body.message.message)
        : body.message.error_description != null
          ? String(body.message.error_description)
          : JSON.stringify(body.message);
    return { message: msg || fallback };
  }

  if (typeof body.raw === 'string') {
    const raw = body.raw.trim();
    return { message: raw ? raw.slice(0, 160) : fallback };
  }

  return { message: fallback };
}

/**
 * @param {Response} res
 * @param {any} body
 * @param {{method: string, url: string}} ctx
 * @returns {HttpError}
 */
function makeHttpError(res, body, ctx) {
  const ex = extractError(body, res.status);
  const prefix = ex.code ? `${ex.code}: ` : '';
  /** @type {HttpError} */
  // eslint-disable-next-line no-undef
  const err = new Error(`${prefix}${ex.message}`.trim() || `HTTP ${res.status}`);

  err.status = res.status;
  err.body = body;
  err.code = ex.code;
  err.method = ctx.method;
  err.url = ctx.url;

  return err;
}

/**
 * Cria AbortSignal com timeout, se solicitado.
 * @param {AbortSignal|undefined} signal
 * @param {number|undefined} timeoutMs
 * @returns {{ signal: AbortSignal|undefined, cancel: (() => void) }}
 */
function withTimeout(signal, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return { signal, cancel: () => {} };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(t),
  };
}

/**
 * Helper de headers de autenticação.
 * Cookie-first: o browser envia cookie automaticamente com `credentials: 'include'`.
 * @returns {HeadersMap}
 */
function authHeaders() {
  // NÃO adicionar Authorization aqui. Sessão é HttpOnly cookie-first.
  return {};
}

/* ========================================================================
   Meta key compatibility (companies: meta vs metadata)
   ======================================================================== */

/**
 * Prepara payload para o backend usando uma chave canônica (`metadata` ou `meta`).
 * Não muta o objeto original.
 *
 * @param {any} payload
 * @param {'metadata'|'meta'} key
 * @returns {any}
 */
function coerceCompanyPayloadForBackend(payload, key = 'metadata') {
  const p = payload && typeof payload === 'object' ? { ...payload } : {};

  if (key === 'metadata') {
    if (p.metadata == null && p.meta != null) p.metadata = p.meta;
    if ('meta' in p) delete p.meta;
  } else {
    if (p.meta == null && p.metadata != null) p.meta = p.metadata;
    if ('metadata' in p) delete p.metadata;
  }

  return p;
}

/**
 * Normaliza registros vindos do backend para o front:
 * - garante `meta` quando vier `metadata`
 * Não muta o objeto original.
 *
 * @param {any} rec
 * @returns {any}
 */
function coerceCompanyRecordForFrontend(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const out = { ...rec };
  // Populate `meta` from `metadata` when missing.  Always remove the
  // `metadata` property so that callers see a single canonical key.
  if (out.meta == null && out.metadata != null) out.meta = out.metadata;
  if (Object.prototype.hasOwnProperty.call(out, 'metadata')) delete out.metadata;
  return out;
}

/**
 * Detecta erro provável de mismatch de chave (`meta`/`metadata`) em backends estritos.
 * @param {any} err
 * @returns {boolean}
 */
function isMetaKeyMismatchError(err) {
  const status = Number(err?.status || 0);
  if (!(status === 400 || status === 422)) return false;
  const msg = String(err?.message || '').toLowerCase();

  const mentionsKey = msg.includes('metadata') || msg.includes('meta');
  const looksLikeSchema =
    msg.includes('unknown') ||
    msg.includes('column') ||
    msg.includes('field') ||
    msg.includes('schema') ||
    msg.includes('invalid');

  return mentionsKey && looksLikeSchema;
}

/* ==========================================================================
  Request core
============================================================================ */

/**
 * Request central (cookie-first) para /api/*.
 *
 * @param {string} method
 * @param {string} path
 * @param {RequestOptions} [opts]
 * @returns {Promise<any>}
 */
async function request(method, path, opts = {}) {
  // Offline/demo stub: when running from a file:// context, avoid network
  // requests to nonexistent backends. Instead, return minimal objects so
  // that the front end can proceed without throwing.
  try {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      const cleanPath = String(path || '').toLowerCase();

      if (cleanPath.includes('/auth/login')) {
        const email = opts?.json?.email || '';
        return { ok: true, user: { email, id: 'demo-user' }, role: 'admin', roles: ['admin'] };
      }

      if (cleanPath.includes('/auth/me')) {
        return { ok: true, user: { email: 'demo@example.com', id: 'demo-user' }, role: 'admin', roles: ['admin'] };
      }

      if (cleanPath.includes('/auth/logout')) {
        return { ok: true };
      }

      if (cleanPath.includes('/processes')) {
        if (cleanPath.match(/\/processes\/?$/)) return [];
        return null;
      }

      if (cleanPath.includes('/evidences')) {
        return { ok: true };
      }

      return { ok: true };
    }
  } catch {
    // If stub logic throws, fall through to real request
  }

  const m = String(method || 'GET').toUpperCase();
  const url = apiUrl(path);
  const responseType = opts.responseType || 'json';

  const headers = {
    Accept: 'application/json',
    ...(opts.headers || {}),
    ...authHeaders(),
  };

  const hasJson = opts.json !== undefined && opts.json !== null;
  const hasBody = opts.body !== undefined && opts.body !== null;

  /** @type {BodyInit|undefined} */
  let body;

  if (hasJson) {
    if (!('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }
    body = JSON.stringify(opts.json);
  } else if (hasBody) {
    // FormData/Blob/string: não forçar content-type
    body = opts.body == null ? undefined : opts.body;
  }

  const t = withTimeout(opts.signal, opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: m,
      headers,
      credentials: 'include', // cookie-first
      cache: 'no-store',
      body: m === 'GET' || m === 'HEAD' ? undefined : body,
      signal: t.signal,
    });

    if (!res.ok) {
      const errBody = await readBodyAsJsonLike(res);
      throw makeHttpError(res, errBody, { method: m, url });
    }

    if (responseType === 'none') return null;
    if (responseType === 'blob') return await res.blob();
    if (responseType === 'text') return await res.text();

    // json-like (defensivo)
    return await readBodyAsJsonLike(res);
  } finally {
    t.cancel();
  }
}

/**
 * Atalho JSON (mantido por compatibilidade interna).
 * @param {string} path
 * @param {{method?: string, headers?: HeadersMap, body?: any, json?: any, responseType?: ResponseType, timeoutMs?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<any>}
 */
async function requestJson(path, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  if (opts.json !== undefined) {
    return await request(method, path, {
      json: opts.json,
      headers: opts.headers,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      responseType: opts.responseType || 'json',
    });
  }

  // Compat: body bruto (string) usado por alguns callers.
  return await request(method, path, {
    body: opts.body,
    headers: opts.headers,
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
    responseType: opts.responseType || 'json',
  });
}

/* ==========================================================================
  Auth
============================================================================ */

/**
 * Autentica no backend (cookie-first). O backend seta cookie HttpOnly.
 * Campos de token eventualmente retornados serão ignorados.
 *
 * @param {{email: string, password: string}} params
 * @returns {Promise<{ok: boolean, user: any, role: any, roles: any, expires_in: any, email: string}>}
 */
export async function authenticateUser({ email, password }) {
  const data = await request('POST', '/auth/login', {
    json: { email, password },
  });

  const safe = {
    ok: Boolean(data?.ok),
    user: data?.user ?? null,
    role: data?.role ?? null,
    roles: data?.roles ?? null,
    expires_in: data?.expires_in ?? null,
    email: String(email || '').trim().toLowerCase(),
  };

  // Cookie-first: não armazena metadados (nem em globalThis, nem em storage).
  // Sessão persistente é mantida pelo backend via cookies HttpOnly.

  return safe;
}

/**
 * Registra um novo usuário.  Envia o payload conforme o contrato do backend
 * e retorna o corpo JSON retornado pelo backend.  Todos os campos são
 * opcionais para permitir defaults; campos ausentes serão tratados pelo
 * backend de acordo com sua lógica de validação.
 *
 * @param {{
 *   company_name?: string,
 *   email?: string,
 *   password?: string,
 *   accept_terms_platform?: boolean,
 *   accept_terms_process?: boolean,
 * }} [params]
 * @returns {Promise<any>}
 */
export async function registerUser(params = {}) {
  return await requestJson('/auth/register', { method: 'POST', json: params || {} });
}

/**
 * Retorna informações do usuário logado (quando suportado pelo backend).
 * @returns {Promise<any>}
 */
export async function me() {
  return await request('GET', '/auth/me');
}

/**
 * Logout (limpa cookie HttpOnly no backend).
 * @returns {Promise<any>}
 */
export async function logout() {
  const out = await request('POST', '/auth/logout', { json: {} });
  return out;
}

/* ==========================================================================
  App State
============================================================================ */

/**
 * Carrega o estado do app do backend.
 * @returns {Promise<import('../types/services.js').AppState>}
 */
export async function loadAppState() {
  return await request('GET', '/app-state');
}

/**
 * Salva estado do app no backend.
 * @param {import('../types/services.js').AppState} payload
 * @returns {Promise<{ok: boolean}>}
 */
export async function saveAppState(payload) {
  return await request('POST', '/app-state', { json: payload || {} });
}

/* ==========================================================================
  Processes
============================================================================ */

/**
 * Lista processos (com filtros opcionais).
 * @param {{stage?: string, auditorEmail?: string, limit?: number}} [params]
 * @returns {Promise<import('../types/core.js').Process[]>}
 */
export async function listProcesses(params = {}) {
  const qs = new URLSearchParams();
  if (params.stage) qs.set('stage', String(params.stage));
  if (params.auditorEmail) qs.set('auditorEmail', String(params.auditorEmail));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return await request('GET', `/processes${q ? `?${q}` : ''}`);
}

/**
 * Busca um processo por ID.
 * @param {string} id
 * @returns {Promise<import('../types/core.js').Process|null>}
 */
export async function getProcessById(id) {
  return await request('GET', `/processes/${encodeURIComponent(String(id))}`);
}

/**
 * Cria/atualiza submissão do participante.
 * @param {any} payload
 * @returns {Promise<{ok: boolean, process?: import('../types/core.js').Process}>}
 */
export async function upsertProcessSubmission(payload) {
  return await request('POST', '/processes', { json: payload || {} });
}

/**
 * Atualiza triagem do processo.
 * @param {string} id
 * @param {import('../types/core.js').ProcessTriage} patch
 * @returns {Promise<{ok: boolean}>}
 */
export async function updateProcessTriage(id, patch) {
  return await request('PATCH', `/processes/${encodeURIComponent(String(id))}/triage`, {
    json: patch || {},
  });
}

/**
 * Atualiza designação de avaliadores do processo.
 * @param {string} id
 * @param {import('../types/core.js').ProcessAssignment} patch
 * @returns {Promise<{ok: boolean}>}
 */
export async function updateProcessAssignment(id, patch) {
  return await request('PATCH', `/processes/${encodeURIComponent(String(id))}/assignment`, {
    json: patch || {},
  });
}

/**
 * Atualiza pareceres técnicos do processo.
 * @param {string} id
 * @param {any} patch
 * @returns {Promise<{ok: boolean}>}
 */
export async function updateProcessReviews(id, patch) {
  return await request('PATCH', `/processes/${encodeURIComponent(String(id))}/reviews`, {
    json: patch || {},
  });
}

/**
 * Atualiza decisão final do processo.
 * @param {string} id
 * @param {import('../types/core.js').ProcessDecision} patch
 * @returns {Promise<{ok: boolean}>}
 */
export async function updateProcessDecision(id, patch) {
  return await request('PATCH', `/processes/${encodeURIComponent(String(id))}/decision`, {
    json: patch || {},
  });
}

/* ==========================================================================
  Evidences
============================================================================ */

/**
 * Lista evidências (metadados).
 * @param {{pillar?: string, indicatorId?: string, limit?: number}} [params]
 * @returns {Promise<import('../types/core.js').EvidenceMeta[]>}
 */
export async function listEvidence(params = {}) {
  const qs = new URLSearchParams();
  if (params.pillar) qs.set('pillar', String(params.pillar));
  if (params.indicatorId) qs.set('indicatorId', String(params.indicatorId));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return await request('GET', `/evidences${q ? `?${q}` : ''}`);
}

/**
 * Cria metadados de evidência e retorna ID (e informações de upload, quando aplicável).
 * @param {string} processId
 * @param {any} meta
 * @returns {Promise<{id: string, upload?: any}>}
 */
export async function createEvidenceMeta(processId, meta) {
  return await request('POST', `/processes/${encodeURIComponent(String(processId))}/evidences`, {
    json: meta || {},
  });
}

/**
 * Envia um arquivo de evidência utilizando o fluxo presign/commit.
 * Se o backend não suportar presign, faz fallback para upload multipart tradicional.
 *
 * @param {string} evidenceId
 * @param {Blob} file
 * @param {any} [meta]
 * @returns {Promise<{ok: boolean}>}
 */
export async function saveEvidence(evidenceId, file, meta = {}) {
  const id = encodeURIComponent(String(evidenceId));

  // Merge file properties into meta when absent.
  const metaWithFile = Object.assign({}, meta || {});
  try {
    if (file && typeof file === 'object') {
      if (!metaWithFile.name && 'name' in file) metaWithFile.name = String(file.name || '');
      if (!metaWithFile.type && 'type' in file) metaWithFile.type = String(file.type || '');
      if (metaWithFile.size == null && 'size' in file) metaWithFile.size = Number(file.size || 0);
    }
  } catch {
    // ignore property merge errors
  }

  try {
    const presignResp = await request('POST', `/evidences/${id}/presign`, {
      json: { meta: metaWithFile },
    });

    const uploadUrl = String(presignResp?.uploadUrl || presignResp?.url || '').trim();
    const objectKey = String(presignResp?.objectKey || '').trim();
    const uploadHeaders = presignResp?.headers && typeof presignResp.headers === 'object' ? presignResp.headers : {};
    if (!uploadUrl || !objectKey) throw new Error('presign missing fields');

    const upRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: file,
    });
    if (!upRes.ok) {
      const errText = await upRes.text().catch(() => '');
      throw new Error(`upload failed: ${upRes.status} ${errText}`);
    }

    const commitResp = await request('POST', `/evidences/${id}/commit`, {
      json: {
        objectKey,
        meta: metaWithFile,
      },
    });
    return commitResp;
  } catch (err) {
    try {
      console.warn('[Evidence] Presign flow failed; legacy upload removed.', err);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Obtém uma evidência para visualização inline.
 * Chama `/evidences/:id/view` (URL assinada). Tenta baixar Blob por compatibilidade;
 * se falhar, retorna {url, meta}.
 *
 * @param {string} evidenceId
 * @returns {Promise<Blob|{url:string, meta?:any}|null>}
 */
export async function getEvidenceFile(evidenceId) {
  const id = encodeURIComponent(String(evidenceId));
  const viewResp = await request('GET', `/evidences/${id}/view`);
  const url = viewResp && typeof viewResp.url === 'string' ? String(viewResp.url) : '';
  const meta = viewResp && typeof viewResp.meta === 'object' ? viewResp.meta : undefined;
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return { url, meta };
    const blob = await res.blob();
    return blob;
  } catch {
    return { url, meta };
  }
}

/**
 * Recupera uma URL assinada para visualizar uma evidência.
 *
 * @param {string} evidenceId
 * @returns {Promise<{url: string, meta?: any}>}
 */
export async function getEvidenceObjectUrl(evidenceId) {
  const id = encodeURIComponent(String(evidenceId));
  const viewResp = await request('GET', `/evidences/${id}/view`);
  const url = viewResp && typeof viewResp.url === 'string' ? String(viewResp.url) : '';
  const meta = viewResp && typeof viewResp.meta === 'object' ? viewResp.meta : undefined;
  return { url, meta };
}

/**
 * Remove uma evidência (meta + arquivo) no backend.
 * @param {string} evidenceId
 * @returns {Promise<{ok: boolean}>}
 */
export async function deleteEvidence(evidenceId) {
  return await requestJson(`/evidences/${encodeURIComponent(String(evidenceId))}`, {
    method: 'DELETE',
  });
}

/* ==========================================================================
  Public pages
============================================================================ */

/**
 * Publica um payload para verificação pública (retorna o ID público gerado).
 * @param {any} payload
 * @returns {Promise<string>}
 */
export async function publishPublicPage(payload) {
  const out = await requestJson('/public-pages', {
    method: 'POST',
    json: payload || {},
  });
  return String(out?.id || '').trim();
}

/* ========================================================================
   Process actions and public preview/publish (pilot)
   ======================================================================== */

/**
 * Advance a process stage via submission API. Sends {process_id, action}
 * and returns the updated process object.
 *
 * @param {object} payload
 * @param {string} payload.process_id The process identifier
 * @param {string} payload.action The action to perform
 * @returns {Promise<any>}
 */
export async function submitProcessAction(payload) {
  return await requestJson('/processes/submission', {
    method: 'POST',
    json: payload || {},
  });
}

/**
 * Generate a preview of a public page from a process.
 *
 * @param {string} processId
 * @param {'html'|'json'} [format]
 * @returns {Promise<any>}
 */
export async function previewPublic(processId, format = 'html') {
  const qs = new URLSearchParams();
  qs.set('process_id', String(processId || ''));
  if (format) qs.set('format', String(format));
  const path = `/public/preview?${qs.toString()}`;
  const responseType = format === 'json' ? 'json' : 'text';
  return await request('GET', path, { responseType });
}

/**
 * Publish a public page from a process.
 *
 * @param {string} processId
 * @returns {Promise<{ public_id: string, url: string }>}
 */
export async function publishPublic(processId) {
  return await requestJson('/public/publish', {
    method: 'POST',
    json: { process_id: processId },
  });
}

/**
 * Abre uma “public page” em nova aba.
 * - Se receber URL absoluta/relativa, abre direto.
 * - Se receber apenas o ID (ex.: pub_xxx), abre o endpoint em /api/public-pages/:id.
 *
 * @param {string} publicIdOrUrl
 * @returns {Promise<void>}
 */
export async function openPublicPage(publicIdOrUrl) {
  const raw = String(publicIdOrUrl || '').trim();
  if (!raw) return;

  const isUrlLike = /^(https?:\/\/|\/)/i.test(raw);
  const url = isUrlLike ? raw : apiUrl(`/public-pages/${encodeURIComponent(raw)}`);

  // eslint-disable-next-line no-undef
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ==========================================================================
  Admin tooling (companies, memberships, auditor assignments)
============================================================================ */

/** @returns {Promise<any[]>} */
export async function listCompanies() {
  const out = await requestJson('/companies', { method: 'GET' });
  if (!Array.isArray(out)) return [];
  return out.map(coerceCompanyRecordForFrontend);
}

/**
 * Cria empresa com compatibilidade `meta` vs `metadata`.
 * - Preferimos enviar `metadata`
 * - Se o backend for estrito e rejeitar, fazemos fallback para `meta`
 *
 * @param {{ name: string, slug?: string, meta?: any, metadata?: any }} payload
 * @returns {Promise<any>}
 */
export async function createCompany(payload) {
  // Always use `meta` as the canonical key when creating companies.
  // The backend accepts both `meta` and `metadata` but persists to the
  // `metadata` column; to avoid ambiguity we send only `meta` here.
  const body = coerceCompanyPayloadForBackend(payload, 'meta');
  const created = await requestJson('/companies', { method: 'POST', json: body });
  return coerceCompanyRecordForFrontend(created);
}

/**
 * @param {string=} companyId
 * @returns {Promise<any[]>}
 */
export async function listMemberships(companyId) {
  const qs = new URLSearchParams();
  if (companyId) qs.set('company_id', String(companyId));
  const path = qs.toString() ? `/memberships?${qs.toString()}` : '/memberships';
  return await requestJson(path, { method: 'GET' });
}

/**
 * @param {{ user_id: string, company_id?: string|null, role: string, is_active?: boolean }} payload
 * @returns {Promise<any>}
 */
export async function createMembership(payload) {
  return await requestJson('/memberships', { method: 'POST', json: payload });
}

/**
 * Resolve um usuário pelo email usando a rota administrativa.  Esta
 * chamada é restrita a administradores e retorna um objeto
 * `{ ok: boolean, user: { id, email } }` quando encontrado.  Quando
 * inexistente, `ok` será false e `user` estará ausente.
 *
 * @param {string} email
 * @returns {Promise<any>}
 */
export async function resolveUserByEmail(email) {
  const body = { email: String(email || '').trim() };
  return await requestJson('/admin/resolve-user', { method: 'POST', json: body });
}

/**
 * @param {string} membershipId
 * @param {{ is_active?: boolean }} patch
 * @returns {Promise<any>}
 */
export async function updateMembership(membershipId, patch) {
  return await requestJson(`/memberships/${encodeURIComponent(membershipId)}`, {
    method: 'PATCH',
    json: patch,
  });
}

/**
 * @param {string=} processId
 * @returns {Promise<any[]>}
 */
export async function listAssignments(processId) {
  const qs = new URLSearchParams();
  if (processId) qs.set('process_id', String(processId));
  const path = qs.toString() ? `/assignments?${qs.toString()}` : '/assignments';
  return await requestJson(path, { method: 'GET' });
}

/**
 * @param {{ process_id: string, principal_id: string, reviewer_id: string }} payload
 * @returns {Promise<any>}
 */
export async function setAssignmentsBulk(payload) {
  return await requestJson('/assignments/bulk', { method: 'POST', json: payload });
}

/* ==========================================================================
  Audit Log
============================================================================ */

/**
 * Recupera eventos de trilha de auditoria associados a um processo.
 * A consulta suporta paginação simples via limit e before (ISO).
 *
 * @param {string} processId Identificador do processo (ex.: proc_xxx)
 * @param {{ limit?: number, before?: string }} [opts]
 * @returns {Promise<any[]>}
 */
export async function getAuditLog(processId, opts = {}) {
  const pid = String(processId || '').trim();
  if (!pid) throw new Error('processId obrigatório');

  const qs = new URLSearchParams();
  qs.set('process_id', pid);
  if (opts && opts.limit) qs.set('limit', String(opts.limit));
  if (opts && opts.before) qs.set('before', String(opts.before));

  const query = qs.toString();
  return await requestJson(`/audit-log${query ? `?${query}` : ''}`, { method: 'GET' });
}
