// netlify/functions/api/routes_public_extras.js
//
// Additional public endpoints supporting preview and publish actions.
//
// This module implements two endpoints under `/public`:
//
//   GET  /public/preview?process_id=<id>&format=html|json
//     Generates a preview of the public page derived from a process.  When
//     format=json is specified the payload is returned as JSON; otherwise
//     an HTML snippet is returned.  No data is persisted.
//
//   POST /public/publish { process_id: <id> }
//     Creates or updates a public page from the given process.  A unique
//     slug is derived from the company name (or a fallback) and the
//     sanitised payload is stored in the `ncs_public_pages` table.  The
//     response includes the slug (public_id) and a relative URL.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Handler for /public routes.  Dispatches based on the second URL segment.
 * @param {any} event
 * @param {string[]} segments
 * @param {any} authCtx
 */
exports.handle = async function handle(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  // Expect at least two segments: ['public', action]
  if (!Array.isArray(segments) || segments.length < 2) {
    return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
  }

  const action = String(segments[1] || '').trim().toLowerCase();

  // GET /public/preview?process_id=...&format=[html|json]
  if (action === 'preview' && (method === 'GET' || method === 'HEAD')) {
    const qs = event.queryStringParameters || {};
    // Canonical key for identifying the process is `process_id`.  Accept
    // legacy `processId` or `id` as a fallback for backwards compatibility.
    const processId = String(
      qs.process_id != null
        ? qs.process_id
        : qs.processId != null
          ? qs.processId
          : qs.id || ''
    ).trim();
    const format = String(qs.format || '').trim().toLowerCase() || 'html';
    if (!processId) {
      return core.json(event, 400, core.err('BAD_REQUEST', 'Parametro process_id obrigatório.'));
    }
    // Always use the user context.  Baseline and service role fallbacks have been removed.
    let row;
    try {
      const jwt = authCtx && authCtx.token ? String(authCtx.token || '').trim() : '';
      if (!jwt) {
        return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
      }
      row = await supa.restSelectObjectUser(
        jwt,
        'ncs_processes',
        `id=eq.${encodeURIComponent(processId)}&select=id,payload,owner_id`,
        { allow404: true }
      );
    } catch {
      row = null;
    }
    if (!row) {
      return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
    }
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    // Derive a public-safe payload (company_name, level, dates)
    const publicPayload = core.sanitizePublicPayload(payload);
    // When requesting JSON explicitly, return JSON
    if (format === 'json') {
      return core.json(event, 200, { id: row.id, payload: publicPayload });
    }
    // Otherwise build a simple HTML preview.  The preview is intentionally
    // minimal; real rendering can be extended as needed.
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />` +
      `<title>${publicPayload.company_name || 'Empresa'}</title></head><body>` +
      `<h1>${publicPayload.company_name || 'Empresa'}</h1>` +
      (publicPayload.level ? `<p><strong>Nível:</strong> ${publicPayload.level}</p>` : '') +
      (publicPayload.issued_at ? `<p><strong>Emitido em:</strong> ${publicPayload.issued_at}</p>` : '') +
      (publicPayload.expires_at ? `<p><strong>Válido até:</strong> ${publicPayload.expires_at}</p>` : '') +
      `</body></html>`;
    const res = core.respond(event, 200, 'text/html; charset=utf-8', html);
    if (method === 'HEAD') {
      res.body = '';
    }
    return res;
  }

  // POST /public/publish { process_id: ... }
  if (action === 'publish' && method === 'POST') {
    const body = core.parseJsonBody(event) || {};
    // Canonical key for identifying the process is `process_id`.  Accept
    // legacy `processId` or `id` as a fallback.  Remove these fallbacks
    // once clients have migrated.
    const processId = String(
      body.process_id != null
        ? body.process_id
        : body.processId != null
          ? body.processId
          : body.id || ''
    ).trim();
    if (!processId) {
      return core.json(event, 400, core.err('BAD_REQUEST', 'Campo process_id obrigatório.'));
    }
    // Fetch process using user context only.  Baseline and service role fallbacks have been removed.
    let row;
    try {
      const jwt = authCtx && authCtx.token ? String(authCtx.token || '').trim() : '';
      if (!jwt) {
        return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
      }
      row = await supa.restSelectObjectUser(
        jwt,
        'ncs_processes',
        `id=eq.${encodeURIComponent(processId)}&select=id,payload,owner_id`,
        { allow404: true }
      );
    } catch {
      row = null;
    }
    if (!row) {
      return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
    }
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    // Sanitize for public consumption
    const publicPayload = core.sanitizePublicPayload(payload);
    // Derive slug from company name
    const companyName = publicPayload.company_name || payload.company_name || payload.companyName || payload.company || 'empresa';
    let slug = core.slugifyLoose(companyName);
    if (!slug) slug = `pub-${processId}`;
    // Upsert into public pages table using user context only.  Baseline and service role fallbacks have been removed.
    const jwtUp = authCtx && authCtx.token ? String(authCtx.token || '').trim() : '';
    if (!jwtUp) {
      return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
    }
    const up = await supa.restUpsertUser(jwtUp, 'ncs_public_pages', {
      slug,
      payload: publicPayload,
      published: true,
      updated_at: core.nowIso(),
    }, { onConflict: 'slug' });
    if (!up.ok) {
      return core.json(event, 500, core.err('DB', 'Falha ao salvar página pública.', up.error || null));
    }
    // Emit an audit event for publishes.  Capture the slug in meta.  Always use
    // the user context.  Ignore any failures during logging so the publish
    // operation still succeeds.
    try {
      const userId = authCtx && authCtx.user && authCtx.user.id ? String(authCtx.user.id || '').trim() : '';
      const eventRecord = {
        entity_type: 'process',
        entity_id: processId,
        action: 'publish',
        actor_id: userId || null,
        meta: { slug },
      };
      await supa.restUpsertUser(jwtUp, 'ncs_audit_log', eventRecord, { onConflict: 'id' });
    } catch {}
    return core.json(event, 200, { public_id: slug, url: `/public/${encodeURIComponent(slug)}` });
  }

  // Unsupported verb or path
  if (action === 'preview' || action === 'publish') {
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
};