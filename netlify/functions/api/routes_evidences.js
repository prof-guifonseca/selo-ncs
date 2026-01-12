// netlify/functions/api/routes_evidences.js
//
// Evidence management routes.  Supports listing evidences, retrieving
// metadata and signed URLs, presigning uploads, committing uploads
// and deleting evidence.  This build supports only row‑level security
// (RLS): all queries run within the context of the authenticated user
// and database policies enforce access control.  Service role fallbacks
// and baseline logic have been removed.  See docs/dev/SECURITY_MODEL.md
// for details.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

// -----------------------------------------------------------------------------
// Configuração de upload
//
// Limite máximo de bytes para uploads inline.  Anteriormente era possível
// configurá-lo via a variável de ambiente `NCS_INLINE_UPLOAD_MAX_BYTES`, mas
// isto criava divergência entre código e documentação e tornava o fluxo
// imprevisível em diferentes ambientes.  O valor agora é fixo aqui; ajuste
// conscientemente se necessário.
const MAX_INLINE_UPLOAD_BYTES = 2_500_000;

/* -------------------------------------------------------------------------
 * Helper functions
 */

// Removed admin helper functions for fetching assignments and evidences.

/* -------------------------------------------------------------------------
 * Legacy baseline code removed. Evidence routes now use RLS implementation.
 */

/* -------------------------------------------------------------------------
 * RLS implementation
 */

async function handleEvidencesRls(event, segments, authCtx) {
  const method = core.normalizeMethod(event.httpMethod);
  const qs = event.queryStringParameters || {};
  const bucket = String(process.env.SUPABASE_BUCKET || 'ncs-evidences');
  const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
  const userId = String(authCtx && authCtx.user && authCtx.user.id ? authCtx.user.id : '').trim();
  const isAdmin = Boolean(authCtx && authCtx.isAdmin);
  if (!jwt || !userId) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));

  // List
  if (segments.length === 1 && method === 'GET') {
    const pillar = qs.pillar ? String(qs.pillar) : null;
    const indicatorId = qs.indicatorId != null ? String(qs.indicatorId) : null;
    const limit = qs.limit != null ? Math.max(1, Math.min(500, Number(qs.limit) || 0)) : 0;
    let query = 'select=id,meta,updated_at,pillar,indicator_id&order=updated_at.desc';
    if (pillar) query += `&pillar=eq.${encodeURIComponent(pillar)}`;
    if (indicatorId) query += `&indicator_id=eq.${encodeURIComponent(indicatorId)}`;
    if (limit) query += `&limit=${encodeURIComponent(String(limit))}`;
    const rows = await supa.restSelectListUser(jwt, 'ncs_evidences', query);
    const out = [];
    for (const r of rows) {
      const meta = r && r.meta && typeof r.meta === 'object' ? r.meta : {};
      const eid = String(r && r.id ? r.id : '').trim();
      if (!eid) continue;
      out.push({ evidenceId: eid, meta });
    }
    return core.json(event, 200, out);
  }

  // Specific operations
  if (segments.length >= 2) {
    const evidenceId = String(segments[1] || '').trim();
    if (!evidenceId) return core.json(event, 400, core.err('BAD_REQUEST', 'missing id'));

    /**
     * Helper to fetch a row visible to the user.  Uses the user JWT
     * and returns null when the row is not visible.
     * @param {string} select
     * @returns {Promise<any|null>}
     */
    async function getRowVisible(select) {
      const row = await supa.restSelectObjectUser(
        jwt,
        'ncs_evidences',
        `id=eq.${encodeURIComponent(evidenceId)}&select=${select}`,
        { allow404: true }
      );
      return row || null;
    }

    // GET meta
    if (segments.length === 3 && segments[2] === 'meta' && method === 'GET') {
      const row = await getRowVisible('meta');
      if (!row) return core.json(event, 404, core.err('NOT_FOUND', 'not found'));
      return core.json(event, 200, row.meta && typeof row.meta === 'object' ? row.meta : {});
    }
    // GET object-url
    if (segments.length === 3 && segments[2] === 'object-url' && method === 'GET') {
      const row = await getRowVisible('meta,storage_path');
      if (!row || !row.storage_path) return core.json(event, 404, core.err('NOT_FOUND', 'not found'));
      const url = await supa.createSignedDownloadUrl(bucket, String(row.storage_path), 600, jwt);
      return core.json(event, 200, { url, meta: row.meta && typeof row.meta === 'object' ? row.meta : {} });
    }

    // GET view (view‑only) – return a short‑lived signed URL for inline viewing.  This
    // route is intended for previewing evidence without triggering a file
    // download.  The URL expires quickly and should be opened directly in
    // the browser (e.g. via <embed> or <iframe>).  It never exposes a
    // download endpoint.
    if (segments.length === 3 && segments[2] === 'view' && method === 'GET') {
      const row = await getRowVisible('meta,storage_path');
      if (!row || !row.storage_path) return core.json(event, 404, core.err('NOT_FOUND', 'not found'));
      const signedUrl = await supa.createSignedDownloadUrl(bucket, String(row.storage_path), 300, jwt);
      return core.json(event, 200, {
        url: signedUrl,
        meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      });
    }
    // GET by id
    if (segments.length === 2 && method === 'GET') {
      const row = await getRowVisible('meta,storage_path');
      if (!row || !row.storage_path) return core.json(event, 404, core.err('NOT_FOUND', 'not found'));
      const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
      const url = await supa.createSignedDownloadUrl(bucket, String(row.storage_path), 600, jwt);
      return core.json(event, 200, { ok: true, evidenceId, url, meta });
    }
    // POST presign
    if (segments.length === 3 && segments[2] === 'presign' && method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const metaIn = body && body.meta && typeof body.meta === 'object' ? body.meta : {};
      const meta = Object.assign({}, metaIn);
      if (!isAdmin) meta.ownerId = userId;
      const objectKey = supa.safeObjectKey(evidenceId);
      const uploadUrl = await supa.createSignedUploadUrl(bucket, objectKey, 300, jwt);
      /** @type {Record<string,string>} */
      const headers = { 'x-upsert': 'true' };
      if (meta && meta.type) headers['Content-Type'] = String(meta.type);
      return core.json(event, 200, { uploadUrl, objectKey, headers });
    }
    // POST commit
    if (segments.length === 3 && segments[2] === 'commit' && method === 'POST') {
      const body = core.parseJsonBody(event) || {};
      const objectKeyIn = String(body && body.objectKey ? body.objectKey : '').trim();
      const metaIn = body && body.meta && typeof body.meta === 'object' ? body.meta : {};
      const meta = Object.assign({}, metaIn);
      if (!objectKeyIn) return core.json(event, 400, core.err('BAD_REQUEST', 'missing objectKey'));
      if (!objectKeyIn.startsWith('evidences/')) return core.json(event, 400, core.err('BAD_REQUEST', 'invalid objectKey'));
      const expectedKey = supa.safeObjectKey(evidenceId);
      if (objectKeyIn !== expectedKey) return core.json(event, 400, core.err('BAD_REQUEST', 'objectKey mismatch'));
      if (!isAdmin) meta.ownerId = userId;

      // Verify that the object exists in storage before committing.  Use the
      // user JWT so that RLS policies apply.  Fail with a client error when
      // the object cannot be found.
      try {
        const path = `/storage/v1/object/${encodeURIComponent(bucket)}/${supa.encodePathSegments(objectKeyIn)}`;
        const head = await supa.supabaseFetchUser(jwt, path, { method: 'HEAD' });
        if (!head || !head.ok) {
          return core.json(event, 400, core.err('UPLOAD_NOT_FOUND', 'Arquivo não encontrado no storage.'));
        }
      } catch {
        return core.json(event, 400, core.err('UPLOAD_NOT_FOUND', 'Arquivo não encontrado no storage.'));
      }

      const mergedMeta = Object.assign({}, meta);
      if (!mergedMeta.createdAt) mergedMeta.createdAt = core.nowIso();
      const pillar = mergedMeta.pillar != null ? String(mergedMeta.pillar) : null;
      const indicatorId = mergedMeta.indicatorId != null ? String(mergedMeta.indicatorId) : null;
      const row = Object.assign(
        {
          id: evidenceId,
          meta: mergedMeta,
          pillar: pillar || null,
          indicator_id: indicatorId || null,
          storage_path: expectedKey,
          updated_at: core.nowIso(),
        },
        mergedMeta.ownerId ? { owner_id: String(mergedMeta.ownerId) } : {}
      );
      const up = await supa.restUpsertUser(
        jwt,
        'ncs_evidences',
        row,
        { onConflict: 'id' }
      );
      if (!up.ok) return core.json(event, 500, core.err('DB', 'Falha ao persistir evidência.'));
      // Emit a minimal audit log for observability.  Prefer the user context
      // when RLS is enabled so that audit rows respect tenant isolation.  The
      // actor_id is implicitly set via the auth.uid() column default; meta
      // captures the object key for reference.  Ignore failures.
      try {
        const auditRecord = {
          action: 'evidence_commit',
          entity_type: 'evidence',
          entity_id: evidenceId,
          actor_id: userId,
          meta: { objectKey: expectedKey },
        };
        await supa.restUpsertUser(jwt, 'ncs_audit_log', auditRecord, { onConflict: 'id' });
      } catch {
        // ignore logging errors
      }
      return core.json(event, 200, { ok: true });
    }
    // DELETE
    if (segments.length === 2 && method === 'DELETE') {
      const row = await getRowVisible('storage_path');
      if (!row) return core.json(event, 404, core.err('NOT_FOUND', 'not found'));
      const storagePath = String(row.storage_path || '').trim();
      const hasSrv = !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (hasSrv && storagePath) {
        try {
          await supa.storageRemoveAdmin(bucket, [storagePath]);
        } catch {
          // best effort
        }
      }
      const del = await supa.restDeleteUser(
        jwt,
        'ncs_evidences',
        `id=eq.${encodeURIComponent(evidenceId)}`
      );
      if (!del.ok) return core.json(event, 500, core.err('DB', 'Falha ao remover evidência.'));
      return core.json(event, 200, { ok: true });
    }
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }
  return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
}

/* -------------------------------------------------------------------------
 * Public API
 */

exports.handle = async function handle(event, segments, authCtx) {
  // Always invoke the RLS implementation.  Baseline support has been removed.
  return handleEvidencesRls(event, segments, authCtx);
};

// Expose the RLS handler for potential advanced integrations.
exports.handleEvidencesRls = handleEvidencesRls;