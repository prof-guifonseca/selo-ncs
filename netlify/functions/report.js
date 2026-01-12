// netlify/functions/report.js
//
// Handler de relatório mínimo para o endpoint `/api/report`.
// Este módulo implementa uma resposta determinística em JSON ou HTML
// sem dependências externas adicionais e sem geração de PDF.  O
// endpoint aceita apenas requisições GET e requer sessão via cookie
// com papel `admin` ou `auditor`.  O corpo JSON inclui dados básicos
// do processo quando possível; o HTML retornado é auto‑contido para
// impressão rápida no navegador.

'use strict';

/**
 * Tipos (somente DX via JSDoc; não afeta runtime).
 * @typedef {import('@netlify/functions').HandlerEvent} NetlifyEvent
 * @typedef {import('@netlify/functions').HandlerContext} NetlifyContext
 * @typedef {import('@netlify/functions').HandlerResponse} NetlifyResponse
 */

const core = require('./api/core.js');
const auth = require('./api/auth.js');
const supa = require('./api/supabase.js');
const domain = require('./api/domain.js');

/**
 * Fetch an ordered list of audit events for a given process.  When RLS is
 * enabled the query runs under the user JWT to honour tenant isolation.
 * The event list is sorted chronologically ascending.  Each event
 * includes the timestamp (occurred_at), actor_id, action and meta.
 *
 * @param {string} processId
 * @param {any} authCtx
 * @returns {Promise<any[]>}
 */
async function fetchEventTrail(processId, authCtx) {
  const pid = String(processId || '').trim();
  if (!pid) return [];
  const query =
    `entity_type=eq.process&entity_id=eq.${encodeURIComponent(pid)}` +
    `&select=occurred_at,actor_id,action,meta` +
    `&order=occurred_at.asc&limit=100`;
  try {
    if (core.isRlsEnabled() && authCtx && authCtx.token) {
      const jwt = String(authCtx.token || '').trim();
      if (!jwt) return [];
      const rows = await supa.restSelectListUser(jwt, 'ncs_audit_log', query);
      return Array.isArray(rows) ? rows : [];
    }
    // Baseline or no user context: use service role
    const rows = await supa.restSelectListAdmin('ncs_audit_log', query);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Escape básico de HTML.  Converte &, < e > para suas
 * entidades HTML correspondentes para evitar injeção.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Fetch process data from Supabase.  Respeita o modo RLS: quando
 * RLS está habilitado e o contexto de autenticação possui token,
 * faz a consulta como usuário; caso contrário, usa a role de
 * serviço.  Quando SUPABASE_URL ou chaves estão ausentes, retorna
 * null sem lançar exceções.
 * @param {string} processId
 * @param {any} authCtx
 * @returns {Promise<any|null>}
 */
async function fetchProcess(processId, authCtx) {
  const pid = String(processId || '').trim();
  if (!pid) return null;
  try {
    const rls = core.isRlsEnabled();
    if (rls && authCtx && authCtx.token) {
      // RLS: consulta com JWT; select id, payload e owner_id
      return await supa.restSelectObjectUser(
        authCtx.token,
        'ncs_processes',
        `id=eq.${encodeURIComponent(pid)}&select=id,payload,owner_id`,
        { allow404: true }
      );
    }
    // Baseline: consulta via service role
    return await supa.restSelectObjectAdmin(
      'ncs_processes',
      `id=eq.${encodeURIComponent(pid)}&select=id,payload,owner_id`,
      { allow404: true }
    );
  } catch {
    // Falha na consulta deve ser silenciosa; retorna null para degradar
    return null;
  }
}

/**
 * Handler principal.  Atende somente GET e retorna JSON ou HTML
 * conforme o cabeçalho Accept.  Em caso de falta de sessão ou
 * permissões, responde com 401/403.  Se o processo não existir,
 * retorna JSON sem dados.
 *
 * Query string:
 *   - process_id: identificador do processo (recomendado)
 *   - id: alias para process_id
 *
 * @param {NetlifyEvent} event
 * @param {NetlifyContext} _context
 * @returns {Promise<NetlifyResponse>}
 */
exports.handler = async function handleReport(event, _context) {
  const method = core.normalizeMethod(event.httpMethod);
  if (method !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Allow: 'GET',
      },
      body: JSON.stringify(core.err('METHOD_NOT_ALLOWED', 'Método não suportado.')),
    };
  }

  // Determinar Accept; fallback para JSON
  const h = core.normalizeHeaderMap(event.headers || {});
  const accept = String(h.accept || '').toLowerCase();
  const wantsHtml = accept.includes('text/html');

  // Resolver autenticação e papel.
  // Cabeçalho "head" indica rota sensível: report deve exigir auth quando configurado.
  let authCtx;
  try {
    authCtx = await auth.buildAuthContext(event, 'report', method);
    if (authCtx && authCtx.response) return authCtx.response;
  } catch {
    // Qualquer falha inesperada cai para 401
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: JSON.stringify(core.err('AUTH_REQUIRED', 'Sessão obrigatória.')),
    };
  }

  // Requer papel admin ou auditor quando auth está habilitada.
  if (authCtx && authCtx.enabled) {
    const roles = Array.isArray(authCtx.roles) ? authCtx.roles : [];
    const hasAccess = authCtx.isAdmin || roles.includes('auditor');
    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
        body: JSON.stringify(core.err('FORBIDDEN', 'Permissão insuficiente.')),
      };
    }
  }

  const qs = event.queryStringParameters || {};
  const processId = String(qs.process_id || qs.id || '').trim();
  const nowIso = core.nowIso();

  /** @type {any} */
  const respJson = {
    process_id: processId || null,
    generated_at: nowIso,
    data: null,
    kpis: null,
  };

  if (processId) {
    // Tenta buscar dados do processo; falha silenciosa.
    const proc = await fetchProcess(processId, authCtx);
    if (proc && proc.payload) {
      respJson.data = {
        id: proc.id,
        owner_id: proc.owner_id || null,
        payload: proc.payload,
      };
      // Se existirem indicadores, calcula KPIs
      try {
        const inds = Array.isArray(proc.payload?.indicators) ? proc.payload.indicators : [];
        respJson.kpis = domain.computeKPIs(inds);
      } catch {
        respJson.kpis = null;
      }
    }
    // Fetch audit trail for this process.  Include at most 100 events.
    try {
      const events = await fetchEventTrail(processId, authCtx);
      respJson.event_trail = Array.isArray(events)
        ? events.map((ev) => {
            return {
              occurred_at: ev.occurred_at || null,
              actor_id: ev.actor_id || null,
              action: ev.action || null,
              meta: ev.meta || null,
            };
          })
        : [];
    } catch {
      respJson.event_trail = [];
    }
  }

  if (!wantsHtml) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: JSON.stringify(respJson),
    };
  }

  // Construir HTML mínimo.  Inclui informações básicas, sem detalhes sensíveis.
  const companyName =
    (respJson.data && respJson.data.payload && respJson.data.payload.company) ||
    (respJson.data && respJson.data.payload && respJson.data.payload.company_name) ||
    '';
  const stage = respJson.data && respJson.data.payload ? respJson.data.payload.stage : '';
  // Construir bloco de KPIs separadamente
  let kpiHtml = '';
  if (respJson.kpis) {
    const k = respJson.kpis;
    const rows = [];
    if (k.pendentes != null) rows.push(`<tr><th>Pendentes</th><td>${escapeHtml(String(k.pendentes))}</td></tr>`);
    if (k.conformes != null) rows.push(`<tr><th>Conformes</th><td>${escapeHtml(String(k.conformes))}</td></tr>`);
    if (k.pontos != null) rows.push(`<tr><th>Pontos</th><td>${escapeHtml(String(k.pontos))}</td></tr>`);
    if (k.scoreTotal != null) rows.push(`<tr><th>Score total</th><td>${escapeHtml(String(k.scoreTotal))}</td></tr>`);
    kpiHtml = `<h2>KPIs</h2><table><tbody>${rows.join('')}</tbody></table>`;
  }
  // Build event trail HTML when events are available.  Each row displays
  // the timestamp, action, actor id and a JSON string of meta.  When no
  // events exist the block is omitted.
  let eventHtml = '';
  if (Array.isArray(respJson.event_trail) && respJson.event_trail.length) {
    const rows = respJson.event_trail.map((ev) => {
      const ts = ev.occurred_at ? escapeHtml(String(ev.occurred_at)) : '';
      const act = ev.action ? escapeHtml(String(ev.action)) : '';
      const actor = ev.actor_id ? escapeHtml(String(ev.actor_id)) : '';
      let metaStr = '';
      try {
        metaStr = ev.meta != null ? escapeHtml(JSON.stringify(ev.meta)) : '';
      } catch {
        metaStr = '';
      }
      return `<tr><td>${ts}</td><td>${act}</td><td>${actor}</td><td>${metaStr}</td></tr>`;
    });
    eventHtml = `<h2>Trilha de eventos</h2><table><thead><tr><th>Data</th><th>Ação</th><th>Actor</th><th>Detalhes</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório NCS</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#101828;background:#fff;margin:20px;}h1{font-size:22px;margin-bottom:12px;}p{margin:6px 0;}.meta{font-size:13px;color:#667085;margin-bottom:10px;border-bottom:1px solid #E4E7EC;padding-bottom:8px;}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;}th,td{border:1px solid #E4E7EC;padding:6px;text-align:left;}th{background:#F9FAFB;font-weight:600;}</style></head><body><h1>Relatório do Processo</h1><div class="meta"><p><strong>ID:</strong> ${escapeHtml(respJson.process_id || '')}</p><p><strong>Empresa:</strong> ${escapeHtml(companyName)}</p><p><strong>Etapa:</strong> ${escapeHtml(stage || '')}</p><p><strong>Gerado em:</strong> ${escapeHtml(nowIso)}</p></div>${kpiHtml}${eventHtml}</body></html>`;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: html,
  };
};
