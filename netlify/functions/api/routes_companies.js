// netlify/functions/api/routes_companies.js
//
// Minimal admin endpoints for managing companies (tenants) without
// manual seeding via the Supabase UI.
//
// Routes:
// - GET  /api/companies
// - POST /api/companies   { name, slug?, meta? }

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * @param {any} authCtx
 * @returns {any|null}
 */
function requireAdmin(authCtx) {
  if (!core.isAuthEnabled()) return null;
  if (!authCtx || !authCtx.userId) return core.err('AUTH_REQUIRED', 'Sessão obrigatória.');
  if (!authCtx.isAdmin) return core.err('FORBIDDEN', 'Acesso restrito (admin).');
  return null;
}

/**
 * Slug mínimo (compatível com a constraint do schema):
 * ^[a-z0-9][a-z0-9-]{2,62}$
 *
 * @param {string} input
 * @returns {string}
 */
function slugify(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  // remove diacríticos (NFD) e caracteres fora do intervalo ASCII básico
  const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let s = norm
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  // garante início alfanumérico
  s = s.replace(/^[^a-z0-9]+/, '');
  // tamanho mínimo 3
  if (s.length < 3) return '';
  if (s.length > 63) s = s.slice(0, 63).replace(/-+$/, '');
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(s)) return '';
  return s;
}

// A legacy baseline-only handler for companies was removed because the backend
// now operates exclusively in RLS mode.  All routes are now handled by
// handleCompaniesRls.

/**
 * RLS: usa JWT do usuário (admin) e confia nas policies.
 * @param {any} event
 * @param {any} authCtx
 */
async function handleCompaniesRls(event, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  const adminErr = requireAdmin(authCtx);
  if (adminErr) return core.json(event, adminErr.code === 'AUTH_REQUIRED' ? 401 : 403, adminErr);

  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  if (!jwt) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));

  if (method === 'GET') {
    const rows = await supa.restSelectListUser(
      jwt,
      'ncs_companies',
      'select=id,name,slug,metadata,created_at&order=created_at.desc'
    );
    const out = Array.isArray(rows)
      ? rows.map((r) => {
          const row = Object.assign({}, r);
          if (row.metadata !== undefined) row.meta = row.metadata;
          if (Object.prototype.hasOwnProperty.call(row, 'metadata')) delete row.metadata;
          return row;
        })
      : [];
    return core.json(event, 200, out);
  }

  if (method === 'POST') {
    const body = core.parseJsonBody(event) || {};
    const name = String(body.name || '').trim();
    const slugIn = String(body.slug || '').trim();
    const slug = slugify(slugIn || name);
    if (!name) return core.json(event, 400, core.err('VALIDATION', 'Campo "name" é obrigatório.'));
    if (!slug) return core.json(event, 400, core.err('VALIDATION', 'Slug inválido.'));

    // Prefer `meta` over `metadata` from the client body.  Persist into
    // the `metadata` column and normalise the response to expose only
    // `meta`.  Legacy keys are deleted.
    let metadata;
    if (body && typeof body.meta === 'object' && body.meta) {
      metadata = body.meta;
    } else if (body && typeof body.metadata === 'object' && body.metadata) {
      metadata = body.metadata;
    } else {
      metadata = {};
    }
    const up = await supa.restUpsertUser(jwt, 'ncs_companies', { name, slug, metadata }, { onConflict: 'slug' });
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao criar empresa.'));
    let row = Array.isArray(up.row) ? up.row[0] : up.row;
    if (row && row.metadata !== undefined) {
      row.meta = row.metadata;
      delete row.metadata;
    }
    return core.json(event, 200, { ok: true, company: row || null });
  }

  return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
}

/**
 * @param {any} event
 * @param {any} authCtx
 */
exports.handle = async function handle(event, authCtx) {
  // Always invoke the RLS implementation.  Baseline support has been removed.
  return await handleCompaniesRls(event, authCtx);
};
