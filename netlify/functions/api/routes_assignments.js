// netlify/functions/api/routes_assignments.js
//
// Minimal admin endpoints to assign auditors (principal/reviewer) to a
// process without manual SQL.
//
// Routes:
// - GET  /api/assignments?process_id=...
// - POST /api/assignments/bulk { process_id, principal_id, reviewer_id }
// - POST /api/assignments      { process_id, auditor_id, role }

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

function requireAdmin(authCtx) {
  if (!core.isAuthEnabled()) return null;
  if (!authCtx || !authCtx.userId) return core.err('AUTH_REQUIRED', 'Sessão obrigatória.');
  if (!authCtx.isAdmin) return core.err('FORBIDDEN', 'Acesso restrito (admin).');
  return null;
}

function normalizeUuid(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[0-9a-fA-F-]{32,36}$/.test(s)) return '';
  return s;
}

/**
 * Normalize a process id.  Process ids use a textual format (e.g. `proc_xxx`)
 * rather than a UUID.  Accept any non‑empty string and return it trimmed.
 * @param {any} v
 * @returns {string}
 */
function normalizeProcessId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s;
}

function normalizeRole(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'principal') return 'principal';
  if (s === 'reviewer') return 'reviewer';
  return '';
}

// Removed baseline upsert helper.  RLS mode uses upsertAssignmentRls.

async function upsertAssignmentRls(jwt, row) {
  return await supa.restUpsertUser(jwt, 'ncs_process_assignments', row, { onConflict: 'process_id,role' });
}

// Removed baseline list helper.  RLS mode uses listAssignmentsRls.

async function listAssignmentsRls(jwt, processId) {
  const q = processId
    ? `process_id=eq.${encodeURIComponent(processId)}&select=id,process_id,auditor_id,role,created_at&order=created_at.desc`
    : 'select=id,process_id,auditor_id,role,created_at&order=created_at.desc&limit=200';
  return await supa.restSelectListUser(jwt, 'ncs_process_assignments', q);
}

// A legacy baseline-only handler for assignments was removed because the backend
// now operates exclusively in RLS mode.  All routes are now handled by
// handleAssignmentsRls.

async function handleAssignmentsRls(event, authCtx, segments) {
  const method = core.normalizeMethod(event.httpMethod);
  const adminErr = requireAdmin(authCtx);
  if (adminErr) return core.json(event, adminErr.code === 'AUTH_REQUIRED' ? 401 : 403, adminErr);

  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  if (!jwt) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));

  if (segments.length === 1 && method === 'GET') {
    const qs = core.parseQuery(event);
    const process_id = normalizeProcessId(qs.process_id);
    const rows = await listAssignmentsRls(jwt, process_id);
    return core.json(event, 200, Array.isArray(rows) ? rows : []);
  }

  if (segments.length === 2 && segments[1] === 'bulk' && method === 'POST') {
    const body = core.parseJsonBody(event) || {};
    const process_id = normalizeProcessId(
      body.process_id != null ? body.process_id : body.processId
    );
    const principal_id = normalizeUuid(
      body.principal_id != null ? body.principal_id : body.principalId
    );
    const reviewer_id = normalizeUuid(
      body.reviewer_id != null ? body.reviewer_id : body.reviewerId
    );
    if (!process_id) return core.json(event, 400, core.err('VALIDATION', 'process_id inválido.'));
    if (!principal_id) return core.json(event, 400, core.err('VALIDATION', 'principal_id inválido.'));
    if (!reviewer_id) return core.json(event, 400, core.err('VALIDATION', 'reviewer_id inválido.'));
    if (principal_id === reviewer_id) {
      return core.json(event, 400, core.err('VALIDATION', 'Principal e reviewer não podem ser o mesmo usuário.'));
    }
    const up1 = await upsertAssignmentRls(jwt, { process_id, auditor_id: principal_id, role: 'principal' });
    if (!up1.ok) return core.json(event, 500, core.err('DB', 'Falha ao atribuir principal.'));
    const up2 = await upsertAssignmentRls(jwt, { process_id, auditor_id: reviewer_id, role: 'reviewer' });
    if (!up2.ok) return core.json(event, 500, core.err('DB', 'Falha ao atribuir reviewer.'));
    // Persist audit log for bulk assignment under RLS.  Use user role
    // (JWT) so policies apply.  Ignore failures silently.
    try {
      const actorId = authCtx && authCtx.user && authCtx.user.id
        ? String(authCtx.user.id || '').trim()
        : null;
      const eventRecord = {
        entity_type: 'process',
        entity_id: process_id,
        action: 'assignment_update',
        actor_id: actorId,
        meta: {
          principalId: principal_id,
          reviewerId: reviewer_id,
        },
      };
      await supa.restUpsertUser(jwt, 'ncs_audit_log', eventRecord, { onConflict: 'id' });
    } catch {}
    return core.json(event, 200, { ok: true });
  }

  if (segments.length === 1 && method === 'POST') {
    const body = core.parseJsonBody(event) || {};
    const process_id = normalizeProcessId(
      body.process_id != null ? body.process_id : body.processId
    );
    const auditor_id = normalizeUuid(
      body.auditor_id != null ? body.auditor_id : body.auditorId
    );
    const role = normalizeRole(body.role);
    if (!process_id) return core.json(event, 400, core.err('VALIDATION', 'process_id inválido.'));
    if (!auditor_id) return core.json(event, 400, core.err('VALIDATION', 'auditor_id inválido.'));
    if (!role) return core.json(event, 400, core.err('VALIDATION', 'role inválido (principal/reviewer).'));
    const up = await upsertAssignmentRls(jwt, { process_id, auditor_id, role });
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao atribuir auditor.'));
    const row = Array.isArray(up.row) ? up.row[0] : up.row;
    // Persist audit log for single assignment under RLS.  Use user role.
    try {
      const actorId = authCtx && authCtx.user && authCtx.user.id
        ? String(authCtx.user.id || '').trim()
        : null;
      const eventRecord = {
        entity_type: 'process',
        entity_id: process_id,
        action: 'assignment_update',
        actor_id: actorId,
        meta: {
          role,
          auditorId: auditor_id,
        },
      };
      await supa.restUpsertUser(jwt, 'ncs_audit_log', eventRecord, { onConflict: 'id' });
    } catch {}
    return core.json(event, 200, { ok: true, assignment: row || null });
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
  return await handleAssignmentsRls(event, authCtx, segments);
};
