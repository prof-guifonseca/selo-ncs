// netlify/functions/api/routes_audit_log.js
//
// Leitura mínima de eventos de trilha de auditoria (audit log).
//
// Exponibiliza GET /api/audit-log com filtros simples para processos.  O
// endpoint retorna uma lista de entradas de audit log ordenadas por
// occurred_at desc.  Este build suporta apenas o modo RLS: a consulta é feita
// utilizando o JWT do usuário (via supabase.restSelectListUser), o
// que aplica automaticamente as políticas de linha.  Suporte baseline
// utilizando service role foi removido.

'use strict';

const core = require('./core.js');
const supa = require('./supabase.js');

/**
 * Manipulador para /api/audit-log.  Suporta somente GET com filtros
 * process_id, limit e before.  Retorna 405 para outros métodos.
 *
 * @param {any} event
 * @param {any} authCtx
 * @param {string[]} segments
 * @returns {Promise<any>}
 */
exports.handle = async function handle(event, authCtx, segments) {
  const method = core.normalizeMethod(event.httpMethod);
  if (method !== 'GET') {
    return core.json(event, 405, core.err('METHOD_NOT_ALLOWED', 'Método não suportado.'));
  }

  const qs = core.parseQuery(event);
  // Canonical key is `process_id`; accept legacy `processId` for backward
  // compatibility.  Remove legacy key usage in a future release.
  const processId = String(
    qs.process_id != null
      ? qs.process_id
      : qs.processId != null
        ? qs.processId
        : ''
  ).trim();
  if (!processId) {
    return core.json(event, 400, core.err('VALIDATION', 'process_id obrigatório.'));
  }
  // Limite máximo de itens retornados.  Evita consultas muito grandes.
  const limit = Math.max(1, Math.min(200, parseInt(qs.limit || '50', 10) || 50));
  // Normalizar parâmetro before.  Além de `before`, aceita aliases
  // legados `before_created_at` ou `before_occurred_at`.  O valor
  // deve ser uma string ISO (YYYY-MM-DDTHH:MM:SS.sssZ) ou similar.  Este
  // filtro é aplicado sobre occurred_at.
  // Canonical parameter is `before`.  Accept legacy aliases
  // `before_occurred_at`, `before_created_at`, or camelCase variant
  // `beforeOccurredAt`.  Filter applied on occurred_at.
  const before = String(
    qs.before != null
      ? qs.before
      : qs.before_occurred_at != null
        ? qs.before_occurred_at
        : qs.before_created_at != null
          ? qs.before_created_at
          : qs.beforeOccurredAt != null
            ? qs.beforeOccurredAt
            : ''
  ).trim();

  // Quando o ambiente de teste define NCS_TEST_AUDIT_LOG, retorna
  // dados mockados.  O valor da variável deve ser um JSON array de
  // objetos contendo pelo menos occurred_at, actor_id, company_id,
  // entity_id e action.  Isto permite que scripts de smoke
  // validem a ordenação sem depender de Supabase.
  const mockEnv = String(process.env.NCS_TEST_AUDIT_LOG || '').trim();
  if (mockEnv) {
    let mockRows;
    try {
      const parsed = JSON.parse(mockEnv);
      mockRows = Array.isArray(parsed) ? parsed : [];
    } catch {
      mockRows = [];
    }
    // Filtra por processo atual (entity_id) e entity_type process
    const filtered = mockRows.filter(
      (r) =>
        String(r && r.entity_id ? r.entity_id : r.process_id || '').trim() === processId &&
        String(r && r.entity_type ? r.entity_type : 'process') === 'process'
    );
    // Se before foi fornecido aplica filtro occurred_at < before
    let res = filtered;
    if (before) {
      const bts = Date.parse(before);
      if (!isNaN(bts)) {
        res = res.filter((r) => {
          const ts = Date.parse(r.occurred_at || r.created_at || r.ts || 0);
          return !isNaN(ts) && ts < bts;
        });
      }
    }
    // Ordena por occurred_at desc.  Se não houver occurred_at tenta created_at ou ts.
    res.sort((a, b) => {
      const ta = Date.parse(a.occurred_at || a.created_at || a.ts || 0);
      const tb = Date.parse(b.occurred_at || b.created_at || b.ts || 0);
      return tb - ta;
    });
    // Aplica limite
    res = res.slice(0, limit);
    // Normaliza shape
    const out = res.map((r) => {
      const occurredAt = r.occurred_at || r.created_at || r.ts || null;
      const actorId = r.actor_user_id || r.actor_id || r.user_id || null;
      const compId = r.company_id || null;
      const entId = r.process_id || r.entity_id || null;
      const evt = r.event_type || r.action || r.event || null;
      const meta = r.meta != null ? r.meta : r.details != null ? r.details : null;
      return {
        event_type: evt || null,
        actor_user_id: actorId,
        company_id: compId,
        process_id: entId,
        meta: meta,
        occurred_at: occurredAt,
      };
    });
    return core.json(event, 200, out);
  }

  // Monta consulta para PostgREST.  Filtra por entity_type=process e
  // entity_id=processId.  Ordena por occurred_at desc e aplica limite.
  const parts = [];
  parts.push(`entity_type=eq.process`);
  parts.push(`entity_id=eq.${encodeURIComponent(processId)}`);
  if (before) {
    // Se fornecido, aplica filtro occurred_at lt before (ISO).
    parts.push(`occurred_at=lt.${encodeURIComponent(before)}`);
  }
  parts.push('order=occurred_at.desc');
  parts.push(`limit=${limit}`);
  const query = parts.join('&');

  // Always use the user context to honour row‑level security policies.  Baseline
  // support has been removed.
  try {
    const jwt = String(authCtx && authCtx.token ? authCtx.token : '').trim();
    if (!jwt) return core.json(event, 401, core.err('AUTH_REQUIRED', 'Sessão obrigatória.'));
    const rows = await supa.restSelectListUser(jwt, 'ncs_audit_log', query);
    // Garante que a resposta seja sempre array ou [].
    const list = Array.isArray(rows) ? rows : [];
    // Normaliza e ordena por occurred_at desc para garantir previsibilidade.
    const normalized = list
      .map((r) => {
        const occurredAt = r.occurred_at || r.created_at || r.ts || null;
        const actorId = r.actor_user_id || r.actor_id || r.user_id || null;
        const compId = r.company_id || null;
        const entId = r.process_id || r.entity_id || null;
        const evt = r.event_type || r.action || r.event || null;
        const meta = r.meta != null ? r.meta : r.details != null ? r.details : null;
        return {
          event_type: evt || null,
          actor_user_id: actorId,
          company_id: compId,
          process_id: entId,
          meta: meta,
          occurred_at: occurredAt,
        };
      })
      .sort((a, b) => {
        const ta = Date.parse(a.occurred_at || 0);
        const tb = Date.parse(b.occurred_at || 0);
        return tb - ta;
      });
    return core.json(event, 200, normalized);
  } catch (err) {
    return core.json(event, 500, core.err('DB', 'Falha ao consultar trilha de auditoria.'));
  }
};