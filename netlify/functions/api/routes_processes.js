// netlify/functions/api/routes_processes.js
//
// Process management routes.  This module implements the full
// behaviour previously embedded in the monolithic index.js.
// This build supports only row‑level security (RLS).  All low level
// data access is performed via supabase.js and helpers come from core.js.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');
// Domain helpers (e.g. KPI computation)
const domain = require('./domain.js');

/* -------------------------------------------------------------------------
 * Helpers
 *
 * These helper functions mirror the behaviour of their counterparts in
 * the original index.js.  They encapsulate common PostgREST queries
 * and permission checks.
 */

// NOTE: removed getAllProcessesAdmin: legacy baseline helper no longer needed.

/**
 * Fetch a single process by id with service role privileges.
 * @param {string} id
 * @returns {Promise<any|null>}
 */
async function getProcessByIdAdmin(id) {
  return supa.restSelectObjectAdmin(
    'ncs_processes',
    `id=eq.${encodeURIComponent(id)}&select=id,payload,owner_id,updated_at`
  );
}

// NOTE: removed isAuditorAssignedToProcessAdmin: legacy baseline helper no longer needed.

// NOTE: removed getAssignedProcessIdsAdmin: legacy baseline helper no longer needed.

/* -------------------------------------------------------------------------
 * Baseline implementation
 *
 * When row‑level security is disabled (NCS_USE_RLS=0), access control is
 * performed in the application.  Admins can view and modify any
 * process; regular users can only see their own processes.  Auditors
 * may also access processes they are assigned to.  All writes are
 * performed via service role.
 */

// Baseline implementation is no longer used.  The function has been
// renamed to indicate removal and is not referenced by the public API.
// Legacy baseline handler preserved for reference (unused in RLS mode).
async function removedHandleProcessesLegacy(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  const qs = event.queryStringParameters || {};

  // Determine auth context
  const authEnabled = Boolean(authCtx && authCtx.enabled);
  const userId = authEnabled ? String(authCtx.user && authCtx.user.id ? authCtx.user.id : '').trim() : '';
  const roles = authEnabled ? (Array.isArray(authCtx.roles) ? authCtx.roles : []) : [];
  const isAdmin = authEnabled ? Boolean(authCtx.isAdmin) : false;
  const isAuditor = authEnabled ? roles.includes('auditor') : false;

  if (authEnabled && !userId) {
    return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
  }

  const stage = qs.stage ? String(qs.stage) : null;
  const auditorEmail = qs.auditorEmail ? String(qs.auditorEmail).toLowerCase() : null;

  // Handle process submission/update for stage transitions
  // POST /processes/submission { process_id, action }
  if (segments.length === 2 && String(segments[1] || '') === 'submission') {
    if (method !== 'POST') {
      return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
    }
    const body = core.parseJsonBody(event) || {};
    // Canonical key is `process_id`.  Accept legacy `processId` or `id` as
    // fallback for backward compatibility.  These fallbacks should be
    // removed in a future release once all clients are updated.
    const processId = String(
      body.process_id != null
        ? body.process_id
        : body.processId != null
          ? body.processId
          : body.id || ''
    ).trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!processId || !action) {
      return core.json(event, 400, core.err('BAD_REQUEST', 'Campos process_id e action são obrigatórios.'));
    }
    // Validate user can modify the process
    const row = await getProcessByIdAdmin(processId);
    if (!row) return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    payload.id = processId;
    // Permission check: admin or owner or assigned auditor
    if (authEnabled && !isAdmin) {
      const ownerId = String(row.owner_id || payload.ownerId || '').trim();
      const assignedOk = isAuditor ? await isAuditorAssignedToProcessAdmin(userId, processId) : false;
      if ((!ownerId || ownerId !== userId) && !assignedOk) {
        return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
      }
    }
    // Update stage based on action, supporting additional align/return actions
    let nextStage;
    switch (action) {
      case 'submit':
        nextStage = 'audit';
        break;
      case 'approve':
        nextStage = 'ready_for_decision';
        break;
      case 'reject':
        nextStage = 'returned';
        break;
      case 'align':
        // Stage used for technical alignment (Portuguese term)
        nextStage = 'alinhamento';
        break;
      case 'return':
        // Return a process back to the operation stage
        nextStage = 'operation';
        break;
      default:
        nextStage = action;
        break;
    }
    payload.stage = nextStage;
    payload.updatedAt = core.nowIso();
    // Persist changes
    const up = await supa.restUpsertAdmin(
      'ncs_processes',
      { id: processId, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
      { onConflict: 'id' },
    );
    if (!up.ok) {
      return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
    }
    // Emit an audit event when the stage changes in baseline mode.  Use the
    // service role since RLS is disabled.  Capture the previous and next
    // stages along with the actor (if available) for traceability.
    try {
      const prevStage = row && row.payload && typeof row.payload === 'object' ? String(row.payload.stage || '') : '';
      const actorId = authEnabled && userId ? userId : null;
      const eventRecord = {
        entity_type: 'process',
        entity_id: processId,
        action: 'stage_change',
        actor_id: actorId,
        meta: { nextStage: nextStage || null, via: action || null },
      };
      // Insert directly via the service role without specifying onConflict so that
      // each change is recorded. The database will generate the id.
      await supa.supabaseFetchAdmin('/rest/v1/ncs_audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [eventRecord],
      });
    } catch {}
    return core.json(event, 200, payload);
  }

  // List processes
  if (segments.length === 1) {
    if (method === 'GET') {
      const limit = Math.max(1, Math.min(200, parseInt(qs.limit || '50', 10) || 50));
      const baseRows = await getAllProcessesAdmin(200);

      /** @type {Set<string>} */
      const allowedIds = new Set();

      if (!authEnabled || isAdmin) {
        for (const r of baseRows) allowedIds.add(String(r.id));
      } else {
        for (const r of baseRows) {
          const ownerId = String(r && r.owner_id ? r.owner_id : '').trim();
          if (ownerId && ownerId === userId) allowedIds.add(String(r.id));
        }
        if (isAuditor) {
          const assigned = await getAssignedProcessIdsAdmin(userId);
          for (const pid of assigned) allowedIds.add(pid);
        }
      }

      const out = [];
      for (const r of baseRows) {
        if (!allowedIds.has(String(r.id))) continue;
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        p.id = r.id;

        if (stage && String(p.stage || '') !== stage) continue;
        if (auditorEmail) {
          const assignedEmails = Array.isArray(p.assignedAuditors) ? p.assignedAuditors : [];
          if (!assignedEmails.map((x) => String(x || '').toLowerCase()).includes(auditorEmail)) continue;
        }

        out.push(p);
        if (out.length >= limit) break;
      }

      return core.json(event, 200, out);
    }

    if (method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const payload = body && typeof body === 'object' ? { ...body } : null;
      if (!payload) return core.json(event, 400, core.err('BAD_REQUEST', 'JSON inválido.'));

      const company = String(payload.company || '').trim();
      if (!company) return core.json(event, 400, core.err('BAD_REQUEST', 'Campo "company" obrigatório.'));

      const providedId = payload.id ? core.ensureTextId(payload.id, 'proc') : '';
      const isWriteAdmin = authEnabled && isAdmin;

      if (authEnabled && !isWriteAdmin) payload.ownerId = userId;

      if (authEnabled && providedId && !isWriteAdmin) {
        const existing0 = await getProcessByIdAdmin(providedId);
        if (existing0) {
          const exOwner = String(existing0.owner_id || '').trim();
          const assignedOk = isAuditor ? await isAuditorAssignedToProcessAdmin(userId, providedId) : false;
          if (exOwner && exOwner !== userId && !assignedOk) {
            return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
          }
        }
      }

      const all = await getAllProcessesAdmin(200);
      const existing = all.find((r) => {
        const p = r.payload || {};
        const sameCompany = String(p.company || '') === company;
        if (!sameCompany) return false;
        if (!authEnabled || isWriteAdmin) return true;
        return String(r.owner_id || '') === userId;
      });

      const id = providedId || (existing ? core.ensureTextId(existing.id, 'proc') : core.ensureTextId(null, 'proc'));
      payload.id = id;

      // Resolve company_id to enforce tenant isolation.  Prefer an explicit
      // company_id/companyId property on the payload, otherwise look up the
      // company by its slug using the service role.  When no company can be
      // resolved the column is omitted to preserve existing behaviour.
      let companyId = null;
      // Canonical key is `company_id`.  Accept legacy `companyId` as a
      // fallback but prefer the canonical key.  Once clients are updated
      // completely this fallback should be removed.
      const explicitCompanyId = payload.company_id != null ? payload.company_id : payload.companyId;
      if (explicitCompanyId) {
        companyId = String(explicitCompanyId).trim() || null;
      } else {
        try {
          const compRow = await supa.restSelectObjectAdmin(
            'ncs_companies',
            `slug=eq.${encodeURIComponent(company)}&select=id`,
            { allow404: true }
          );
          if (compRow && compRow.id) companyId = String(compRow.id);
        } catch {
          companyId = null;
        }
      }

      payload.updatedAt = core.nowIso();
      if (!payload.createdAt) {
        payload.createdAt = existing && existing.payload && existing.payload.createdAt ? existing.payload.createdAt : core.nowIso();
      }

      const ownerIdFinal =
        authEnabled && !isWriteAdmin
          ? userId
          : String(existing && existing.owner_id ? existing.owner_id : payload.ownerId || '').trim();

      if (authEnabled && !isWriteAdmin) payload.ownerId = userId;
      if (!payload.ownerId && ownerIdFinal) payload.ownerId = ownerIdFinal;

      // Always recompute KPIs server‑side.  Ignore any client‑provided kpis/score.
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {
        // noop on KPI compute failure
      }

      // FIX: nunca espalhar null (crash). Use {} no fallback.
      const row = Object.assign(
        { id, payload, updated_at: core.nowIso() },
        ownerIdFinal ? { owner_id: ownerIdFinal } : {},
        companyId ? { company_id: companyId } : {}
      );

      const up = await supa.restUpsertAdmin('ncs_processes', row, { onConflict: 'id' });
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));

      return core.json(event, 200, payload);
    }

    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  // Item routes
  if (segments.length >= 2) {
    const id = core.ensureTextId(segments[1], 'proc');
    const row = await getProcessByIdAdmin(id);
    if (!row) return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));

    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    payload.id = id;

    if (authEnabled && !isAdmin) {
      const ownerId = String(row.owner_id || payload.ownerId || '').trim();
      const assignedOk = isAuditor ? await isAuditorAssignedToProcessAdmin(userId, id) : false;
      if ((!ownerId || ownerId !== userId) && !assignedOk) {
        return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
      }
    }

    if (method === 'GET') return core.json(event, 200, payload);

    // Add evidences
    if (segments.length === 3 && segments[2] === 'evidences' && method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const evidenceIdsRaw = Array.isArray(body.evidenceIds)
        ? body.evidenceIds
        : body.evidenceId != null
          ? [body.evidenceId]
          : [];
      const evidenceIds = evidenceIdsRaw.map((x) => String(x || '').trim()).filter(Boolean);
      payload.evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : [];
      for (const eid of evidenceIds) if (!payload.evidenceIds.includes(eid)) payload.evidenceIds.push(eid);

      payload.updatedAt = core.nowIso();
      // recompute KPIs after modifying evidence list
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      // Log attachment of evidences to the process.  Capture the list of
      // evidenceIds after the update for auditing.  In baseline mode we use
      // the service role since RLS is disabled.
      try {
        await supa.restUpsertAdmin('ncs_audit_log', {
          entity_type: 'process',
          entity_id: id,
          action: 'evidence_attach',
          actor_id: authEnabled && userId ? userId : null,
          meta: { evidenceIds: payload.evidenceIds || [] },
        }, { onConflict: 'id' });
      } catch {}
      return core.json(event, 200, payload);
    }

    // Remove evidence
    if (segments.length === 4 && segments[2] === 'evidences' && method === 'DELETE') {
      const evidenceId = String(segments[3] || '').trim();
      payload.evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : [];
      payload.evidenceIds = payload.evidenceIds.filter((x) => String(x) !== evidenceId);

      payload.updatedAt = core.nowIso();
      // recompute KPIs after modifying evidence list
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }

    // Update triage
    if (segments.length === 3 && segments[2] === 'triage' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.triage = Object.assign({}, payload.triage || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating triage
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }

    // Update assignment (admin only)
    if (segments.length === 3 && segments[2] === 'assignment' && method === 'PATCH') {
      if (authEnabled && !isAdmin) return core.json(event, 403, core.err('FORBIDDEN', 'Apenas admin pode alterar assignment.'));
      const body = core.parseJsonBody(event) || {};
      if (Array.isArray(body.assignedAuditors)) payload.assignedAuditors = body.assignedAuditors;
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating assignment
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }

    // Update reviews
    if (segments.length === 3 && segments[2] === 'reviews' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.reviews = Object.assign({}, payload.reviews || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating reviews
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }

    // Update decision
    if (segments.length === 3 && segments[2] === 'decision' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.decision = Object.assign({}, payload.decision || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating decision
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertAdmin(
        'ncs_processes',
        { id, payload, updated_at: core.nowIso(), owner_id: row.owner_id || null },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      // Emit an audit event for decision updates.  Persist the decision
      // payload as part of the meta for future traceability.  Use the
      // service role since RLS is disabled.
      try {
        await supa.restUpsertAdmin('ncs_audit_log', {
          entity_type: 'process',
          entity_id: id,
          action: 'decision_update',
          actor_id: authEnabled && userId ? userId : null,
          meta: { decision: body || {} },
        }, { onConflict: 'id' });
      } catch {}
      return core.json(event, 200, payload);
    }

    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
}

/* -------------------------------------------------------------------------
 * RLS implementation
 *
 * When row‑level security is enabled (NCS_USE_RLS=1) the backend
 * defers ownership checks to the database via the user JWT.  Admins
 * continue to use service role for admin-only logic, but all CRUD
 * operations are scoped by the JWT.  See docs/dev/SECURITY_MODEL.md
 * for more details.
 */

async function handleProcessesRls(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  const qs = event.queryStringParameters || {};
  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  const userId = String(authCtx && authCtx.user && authCtx.user.id ? authCtx.user.id : '').trim();
  const isAdmin = Boolean(authCtx && authCtx.isAdmin);
  if (!jwt || !userId) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));

  const stage = qs.stage ? String(qs.stage) : null;
  const auditorEmail = qs.auditorEmail ? String(qs.auditorEmail).toLowerCase() : null;

  // Handle submission stage updates
  if (segments.length === 2 && String(segments[1] || '') === 'submission') {
    if (method !== 'POST') {
      return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
    }
    const body = core.parseJsonBody(event) || {};
    // Canonical key for identifying the process is `process_id`.  Accept
    // legacy `processId` or `id` keys as a fallback.  These fallbacks
    // exist only for compatibility and should be removed once clients
    // are updated.
    const processId = String(
      body.process_id != null
        ? body.process_id
        : body.processId != null
          ? body.processId
          : body.id || ''
    ).trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!processId || !action) {
      return core.json(event, 400, core.err('BAD_REQUEST', 'Campos process_id e action são obrigatórios.'));
    }
    // fetch process under user context.  When RLS is enabled we do not use
    // service role helpers to fetch rows.  If the record is not visible
    // under the current user context (e.g. cross‑tenant), return 404.
    let row = null;
    try {
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
    payload.id = processId;
    // Determine next stage
    // Determine next stage from the action.  Support additional admin
    // actions such as "align" and "return".  Unknown values are used
    // verbatim to enable custom stages.
    let nextStage;
    switch (action) {
      case 'submit':
        nextStage = 'audit';
        break;
      case 'approve':
        nextStage = 'ready_for_decision';
        break;
      case 'reject':
        nextStage = 'returned';
        break;
      case 'align':
        // Stage used for technical alignment (Portuguese: alinhamento)
        nextStage = 'alinhamento';
        break;
      case 'return':
        // Return a process back to the operation stage
        nextStage = 'operation';
        break;
      default:
        nextStage = action;
        break;
    }
    payload.stage = nextStage;
    payload.updatedAt = core.nowIso();
    // Persist using the user context regardless of admin status.  When RLS
    // is enabled service role helpers are disabled; admin privileges are
    // enforced via database policies.  Include owner_id when available.
    const upData = { id: processId, payload, updated_at: core.nowIso() };
    if (row && row.owner_id) upData.owner_id = row.owner_id || null;
    const up = await supa.restUpsertUser(
      jwt,
      'ncs_processes',
      upData,
      { onConflict: 'id' }
    );
    if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));

    // Emit an audit event for stage changes.  Record only the next stage and
    // the action that triggered the change.  Use the user context to insert
    // into ncs_audit_log so that RLS policies are honoured.  Avoid using
    // onConflict so that each change creates a distinct entry.  Failures are
    // ignored to prevent disruption of the main flow.
    try {
      const eventRecord = {
        entity_type: 'process',
        entity_id: processId,
        action: 'stage_change',
        actor_id: userId,
        meta: { nextStage: nextStage || null, via: action || null },
      };
      await supa.supabaseFetchUser(jwt, '/rest/v1/ncs_audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [eventRecord],
      });
    } catch {}
    return core.json(event, 200, payload);
  }

  // List
  if (segments.length === 1) {
    if (method === 'GET') {
      const limit = Math.max(1, Math.min(200, parseInt(qs.limit || '50', 10) || 50));
      const rows = await supa.restSelectListUser(
        jwt,
        'ncs_processes',
        `select=id,payload,owner_id,updated_at&order=updated_at.desc&limit=${encodeURIComponent(String(limit))}`
      );
      const out = [];
      for (const r of rows) {
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        p.id = r.id;
        const ownerId = String(r.owner_id || p.ownerId || '').trim();
        if (ownerId && !p.ownerId) p.ownerId = ownerId;
        if (stage && String(p.stage || '') !== stage) continue;
        if (auditorEmail) {
          const assignedEmails = Array.isArray(p.assignedAuditors) ? p.assignedAuditors : [];
          if (!assignedEmails.map((x) => String(x || '').toLowerCase()).includes(auditorEmail)) continue;
        }
        out.push(p);
        if (out.length >= limit) break;
      }
      return core.json(event, 200, out);
    }
    if (method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const payload = body && typeof body === 'object' ? { ...body } : null;
      if (!payload) return core.json(event, 400, core.err('BAD_REQUEST', 'JSON inválido.'));
      const company = String(payload.company || '').trim();
      if (!company) return core.json(event, 400, core.err('BAD_REQUEST', 'Campo "company" obrigatório.'));
      const providedId = payload.id ? core.ensureTextId(payload.id, 'proc') : '';
      const writeOwnerId = isAdmin ? String(payload.ownerId || '').trim() : userId;

      // Resolve company_id.  Prefer explicit company_id/companyId on the
      // payload; otherwise, look up the company by its slug using the
      // authenticated user context.  When no company can be resolved
      // (e.g. slug not found), the column is omitted so that
      // subsequent writes preserve existing behaviour.
      let companyIdResolved = null;
      const explicitCompanyIdRls =
        payload.company_id != null ? payload.company_id : payload.companyId;
      if (explicitCompanyIdRls) {
        companyIdResolved = String(explicitCompanyIdRls).trim() || null;
      } else {
        try {
          const compRowRls = await supa.restSelectObjectUser(
            jwt,
            'ncs_companies',
            `slug=eq.${encodeURIComponent(company)}&select=id`,
            { allow404: true }
          );
          if (compRowRls && compRowRls.id) companyIdResolved = String(compRowRls.id);
        } catch {
          companyIdResolved = null;
        }
      }

      if (providedId) {
        const visible = await supa.restSelectObjectUser(
          jwt,
          'ncs_processes',
          `id=eq.${encodeURIComponent(providedId)}&select=id,payload,owner_id`
        );
        if (visible) {
          const ownerId =
            String(
              visible.owner_id || (visible.payload && visible.payload.ownerId ? visible.payload.ownerId : userId)
            ).trim() || userId;
          payload.id = providedId;
          payload.ownerId = ownerId;
          payload.createdAt = String(
            visible.payload && visible.payload.createdAt ? visible.payload.createdAt : payload.createdAt || core.nowIso()
          );
          payload.updatedAt = core.nowIso();
          const up0 = await supa.restUpsertUser(
            jwt,
            'ncs_processes',
            { id: providedId, payload, updated_at: core.nowIso() },
            { onConflict: 'id' }
          );
          if (!up0.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
          return core.json(event, 200, payload);
        }
        // When RLS is enabled non‑admins must not bypass policies by
        // querying with service role privileges.  If the process is not
        // visible via the user JWT we simply return 404 without
        // attempting to peek via the service role.  This prevents
        // inference of hidden process ids.
        if (!isAdmin) {
          return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
        }
      }
      const all = await supa.restSelectListUser(
        jwt,
        'ncs_processes',
        'select=id,payload,owner_id&order=updated_at.desc&limit=200'
      );
      const existing = all.find(
        (r) => String(r && r.payload && r.payload.company ? r.payload.company : '') === company
      );
      const id = providedId || (existing ? core.ensureTextId(existing.id, 'proc') : core.ensureTextId(null, 'proc'));
      payload.id = id;
      const existingOwner = existing
        ? String(existing.owner_id || (existing.payload && existing.payload.ownerId ? existing.payload.ownerId : '')).trim()
        : '';
      payload.ownerId = existingOwner || writeOwnerId || userId;
      payload.updatedAt = core.nowIso();
      if (!payload.createdAt) payload.createdAt = core.nowIso();
      // recompute KPIs server side before persisting
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const row = existing
        ? Object.assign(
            { id, payload, updated_at: core.nowIso() },
            companyIdResolved ? { company_id: companyIdResolved } : {}
          )
        : Object.assign(
            { id, payload, updated_at: core.nowIso() },
            { owner_id: writeOwnerId || userId },
            companyIdResolved ? { company_id: companyIdResolved } : {}
          );
      const up1 = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        row,
        { onConflict: 'id' }
      );
      if (!up1.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  // Item routes
  if (segments.length >= 2) {
    const id = core.ensureTextId(segments[1], 'proc');
    const row = await supa.restSelectObjectUser(
      jwt,
      'ncs_processes',
      `id=eq.${encodeURIComponent(id)}&select=id,payload,owner_id`
    );
    if (!row) return core.json(event, 404, core.err('NOT_FOUND', 'Processo não encontrado.'));
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    payload.id = id;
    if (method === 'GET') return core.json(event, 200, payload);
    // Add evidences
    if (segments.length === 3 && segments[2] === 'evidences' && method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const evidenceIdsRaw = Array.isArray(body.evidenceIds)
        ? body.evidenceIds
        : body.evidenceId != null
          ? [body.evidenceId]
          : [];
      const evidenceIds = evidenceIdsRaw.map((x) => String(x || '').trim()).filter(Boolean);
      payload.evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : [];
      for (const eid of evidenceIds) if (!payload.evidenceIds.includes(eid)) payload.evidenceIds.push(eid);
      payload.updatedAt = core.nowIso();
      // recompute KPIs after modifying evidence list
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      // Emit an audit event recording which evidences were attached.  The
      // `added` field captures the ids passed in the request.  Best effort:
      // failures are ignored so as not to block the main operation.
      try {
        const eventRecord = {
          entity_type: 'process',
          entity_id: id,
          action: 'evidence_attach',
          actor_id: userId,
          meta: { added: evidenceIds, evidenceIds: payload.evidenceIds || [] },
        };
        await supa.restUpsertUser(jwt, 'ncs_audit_log', eventRecord, { onConflict: 'id' });
      } catch {}
      return core.json(event, 200, payload);
    }
    // Remove evidence
    if (segments.length === 4 && segments[2] === 'evidences' && method === 'DELETE') {
      const evidenceId = String(segments[3] || '').trim();
      payload.evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : [];
      payload.evidenceIds = payload.evidenceIds.filter((x) => String(x) !== evidenceId);
      payload.updatedAt = core.nowIso();
      // recompute KPIs after modifying evidence list
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      // Emit an audit event capturing decision updates.  Persist the body
      // payload in meta for traceability.  Failures are ignored.
      try {
        const eventRecord = {
          entity_type: 'process',
          entity_id: id,
          action: 'decision_update',
          actor_id: userId,
          meta: { decision: body || {} },
        };
        await supa.restUpsertUser(jwt, 'ncs_audit_log', eventRecord, { onConflict: 'id' });
      } catch {}
      return core.json(event, 200, payload);
    }
    // Update triage
    if (segments.length === 3 && segments[2] === 'triage' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.triage = Object.assign({}, payload.triage || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating triage
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }
    // Update assignment (admin only via admin channel)
    if (segments.length === 3 && segments[2] === 'assignment' && method === 'PATCH') {
      if (!isAdmin) return core.json(event, 403, core.err('FORBIDDEN', 'Apenas admin pode alterar assignment.'));
      const body = core.parseJsonBody(event) || {};
      if (Array.isArray(body.assignedAuditors)) payload.assignedAuditors = body.assignedAuditors;
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating assignment
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      // Persist assignment changes via the user context.  Under RLS the
      // service role is disabled; admin privileges are enforced via
      // database policies.  Do not include owner_id in the update to
      // avoid privileged writes outside of policies.
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }
    // Update reviews
    if (segments.length === 3 && segments[2] === 'reviews' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.reviews = Object.assign({}, payload.reviews || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating reviews
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }
    // Update decision
    if (segments.length === 3 && segments[2] === 'decision' && method === 'PATCH') {
      const body = core.parseJsonBody(event) || {};
      payload.decision = Object.assign({}, payload.decision || {}, body || {});
      payload.updatedAt = core.nowIso();
      // recompute KPIs after updating decision
      try {
        payload.kpis = domain.computeKPIs(Array.isArray(payload.indicators) ? payload.indicators : []);
      } catch {}
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_processes',
        { id, payload, updated_at: core.nowIso() },
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir processo.'));
      return core.json(event, 200, payload);
    }
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }
  return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
}

/* -------------------------------------------------------------------------
 * Public API
 */

/**
 * Entrypoint for the /processes route.  Always invokes the RLS implementation.
 * Baseline support has been removed.
 * @param {any} event
 * @param {string[]} segments
 * @param {any} authCtx
 */
exports.handle = async function handle(event, segments, authCtx) {
  // Always invoke the RLS implementation.  Baseline support has been removed.
  return handleProcessesRls(event, segments, authCtx);
};

// Expose the RLS handler for potential advanced integrations.
exports.handleProcessesRls = handleProcessesRls;