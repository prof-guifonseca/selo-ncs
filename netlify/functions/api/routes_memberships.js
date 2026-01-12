// netlify/functions/api/routes_memberships.js
//
// Minimal admin endpoints to manage memberships/roles without opening
// the Supabase editor.
//
// Routes:
// - GET  /api/memberships?company_id=...
// - POST /api/memberships   { user_id, company_id?, role, is_active? }
// - PATCH /api/memberships/:id  { is_active }

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

function normalizeRole(r) {
  const s = String(r || '').trim().toLowerCase();
  if (s === 'admin') return 'admin';
  if (s === 'auditor') return 'auditor';
  if (s === 'client') return 'client';
  return '';
}

function normalizeUuid(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  // UUID v4-ish basic validation (enough for UI inputs)
  if (!/^[0-9a-fA-F-]{32,36}$/.test(s)) return '';
  return s;
}

// A legacy baseline-only handler for memberships was removed because the backend
// now operates exclusively in RLS mode.

async function handleMembershipsRls(event, authCtx, segments) {
  const method = core.normalizeMethod(event.httpMethod);
  const adminErr = requireAdmin(authCtx);
  if (adminErr) return core.json(event, adminErr.code === 'AUTH_REQUIRED' ? 401 : 403, adminErr);

  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  if (!jwt) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));

  if (segments.length === 1 && method === 'GET') {
    const qs = event.queryStringParameters || {};
    const companyId = normalizeUuid(qs.company_id || qs.companyId);
    const filter = companyId ? `company_id=eq.${encodeURIComponent(companyId)}&` : '';
    const rows = await supa.restSelectListUser(
      jwt,
      'ncs_memberships',
      `${filter}select=id,user_id,company_id,role,is_active,created_at&order=created_at.desc&limit=200`
    );
    return core.json(event, 200, Array.isArray(rows) ? rows : []);
  }

  if (segments.length === 1 && method === 'POST') {
    const body = core.parseJsonBody(event) || {};
    const user_id = normalizeUuid(body.user_id || body.userId);
    const company_id = normalizeUuid(body.company_id || body.companyId);
    const role = normalizeRole(body.role);
    const is_active = body.is_active === undefined ? true : Boolean(body.is_active);

    if (!user_id) return core.json(event, 400, core.err('VALIDATION', 'user_id inválido.'));
    if (!role) return core.json(event, 400, core.err('VALIDATION', 'role inválido (admin/auditor/client).'));
    if (role !== 'admin' && !company_id) {
      return core.json(event, 400, core.err('VALIDATION', 'company_id é obrigatório para auditor/client.'));
    }

    const row = { user_id, role, is_active };
    if (role !== 'admin') row.company_id = company_id;
    const up = await supa.restUpsertUser(jwt, 'ncs_memberships', row, {
      onConflict: role === 'admin' ? 'user_id,role' : 'company_id,user_id,role',
    });
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao criar membership.'));
    const outRow = Array.isArray(up.row) ? up.row[0] : up.row;
    return core.json(event, 200, { ok: true, membership: outRow || null });
  }

  if (segments.length === 2 && method === 'PATCH') {
    const id = normalizeUuid(segments[1]);
    if (!id) return core.json(event, 400, core.err('VALIDATION', 'id inválido.'));
    const body = core.parseJsonBody(event) || {};
    if (body.is_active === undefined) {
      return core.json(event, 400, core.err('VALIDATION', 'Campo is_active é obrigatório.'));
    }
    const up = await supa.restUpsertUser(jwt, 'ncs_memberships', { id, is_active: Boolean(body.is_active) }, {
      onConflict: 'id',
    });
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao atualizar membership.'));
    const outRow = Array.isArray(up.row) ? up.row[0] : up.row;
    return core.json(event, 200, { ok: true, membership: outRow || null });
  }

  return core.json(event, 404, core.err('NOT_FOUND', 'Rota inválida.'));
}

/**
 * @param {any} event
 * @param {any} authCtx
 * @param {string[]} segments
 */
exports.handle = async function handle(event, authCtx, segments) {
  // Always invoke the RLS implementation.  Baseline support has been removed.
  return await handleMembershipsRls(event, authCtx, segments);
};
