// netlify/functions/api/routes_public.js
//
// Public pages routes.  Implements a read‑only API for published
// company pages and an admin‑only API for publishing new pages.  In
// read mode requests are served anonymously and do not require a
// session.  Writes require an admin role and use the authenticated
// user's JWT to honour row‑level security.  Service role fallbacks have
// been removed.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Entry point for the /public-pages route.  Supports GET/HEAD for
 * listing and retrieving pages and POST for creating/updating pages.
 * @param {any} event
 * @param {string[]} segments
 * @param {any} authCtx
 */
exports.handle = async function handle(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  if (method === 'GET' || method === 'HEAD') {
    const qs = event.queryStringParameters || {};
    const qRaw = String(qs.q || '').trim();
    const limit = Math.max(1, Math.min(50, Number(qs.limit || 10)));
    // List pages
    if (segments.length === 1) {
      const qSlug = qRaw ? core.slugifyLoose(qRaw) : '';
      const queryParts = [
        'select=slug,payload',
        'published=eq.true',
        qSlug ? `slug=ilike.*${encodeURIComponent(qSlug)}*` : null,
        'order=updated_at.desc',
        `limit=${encodeURIComponent(String(limit))}`,
      ].filter(Boolean);
      const rows = await supa.restSelectListAnon('ncs_public_pages', queryParts.join('&'));
      const items = rows.map((r) => {
        const payload = core.sanitizePublicPayload(r && r.payload ? r.payload : {});
        return {
          slug: String(r && r.slug ? r.slug : ''),
          company_name: payload.company_name,
          level: payload.level || null,
        };
      });
      const res = core.json(event, 200, { items });
      return method === 'HEAD' ? Object.assign({}, res, { body: '' }) : res;
    }
    // Retrieve a single page
    if (segments.length === 2) {
      const slug = String(segments[1] || '').trim();
      if (!slug) return core.json(event, 400, core.err('BAD_REQUEST', 'Slug inválido.'));
      const obj = await supa.restSelectObjectAnon(
        'ncs_public_pages',
        `select=slug,payload&published=eq.true&slug=eq.${encodeURIComponent(slug)}`,
        { allow404: true }
      );
      if (!obj || !obj.slug) return core.json(event, 404, core.err('NOT_FOUND', 'Não encontrado.'));
      const res = core.json(event, 200, { slug: obj.slug, payload: core.sanitizePublicPayload(obj.payload || {}) });
      return method === 'HEAD' ? Object.assign({}, res, { body: '' }) : res;
    }
    return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
  }
  if (method === 'POST') {
    const isAdmin = Boolean(authCtx && authCtx.isAdmin);
    if (!isAdmin) return core.json(event, 403, core.err('FORBIDDEN', 'Apenas admin.'));
    const body = core.parseJsonBody(event) || {};
    if (!body || typeof body !== 'object') return core.json(event, 400, core.err('BAD_REQUEST', 'Payload inválido.'));
    const payloadIn = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const published = body.published !== false;
    const companyName =
      payloadIn.company_name ||
      payloadIn.companyName ||
      payloadIn.empresa ||
      payloadIn.name ||
      payloadIn.company ||
      'Empresa';
    const slug = String(body.slug || payloadIn.slug || core.slugifyLoose(companyName)).trim();
    if (!slug) return core.json(event, 400, core.err('BAD_REQUEST', 'Slug inválido.'));
    const payload = core.sanitizePublicPayload(Object.assign({}, payloadIn, { company_name: companyName }));
    const row = { slug, payload, published, updated_at: core.nowIso() };
    // Always use the user context.  Baseline and service role fallbacks have been removed.
    const jwt = authCtx && authCtx.token ? String(authCtx.token || '').trim() : '';
    if (!jwt) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
    const up = await supa.restUpsertUser(jwt, 'ncs_public_pages', row, { onConflict: 'slug' });
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao salvar página pública.', up.error || null));
    return core.json(event, 200, { ok: true, slug, url: `/public/${encodeURIComponent(slug)}` });
  }
  return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
};