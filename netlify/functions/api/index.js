// netlify/functions/api/index.js
//
// This file implements a thin router/dispatcher for the Netlify
// functions API.  All business logic lives in separate modules.  The
// handler resolves the authentication context and delegates to the
// appropriate route handler based on the first URL segment.  When
// extending the API add a new routes_<name>.js file and wire it up
// here.

'use strict';

const core = require('./core.js');
const auth = require('./auth.js');
const routesHealth = require('./routes_health.js');
const routesAuth = require('./routes_auth.js');
const routesAppState = require('./routes_appstate.js');
const routesSession = require('./routes_session.js');
const routesProcesses = require('./routes_processes.js');
// Removed unused auditor routes. The legacy auditor wrapper caused
// recursive calls and is no longer referenced.
// const routesAuditor = require('./routes_auditor.js');
const routesPublic = require('./routes_public.js');
// Extra public routes (preview/publish) under /public
const routesPublicExtras = require('./routes_public_extras.js');
const routesEvidences = require('./routes_evidences.js');
const routesCompanies = require('./routes_companies.js');
const routesMemberships = require('./routes_memberships.js');
const routesAssignments = require('./routes_assignments.js');
const routesAuditLog = require('./routes_audit_log.js');
// Administrative utility routes. Provides misc admin-only endpoints such as
// user resolution. These routes are loaded lazily only when requested.
const routesAdmin = require('./routes_admin.js');

/**
 * Netlify handler.  Resolves CORS preflight requests, constructs an
 * auth context, and dispatches to the corresponding route handler.
 * Any unhandled route results in a 404.
 * @param {any} event
 * @param {any} context
 */
exports.handler = async (event, context) => {
  // assign a request id early for error tracking
  event.__ncs_request_id = core.getRequestId(event);

  // Fail fast when RLS has been explicitly disabled.  This guard
  // inspects NCS_USE_RLS and returns a response when misconfigured.
  const misconfig = core.requireRlsOnly(event);
  if (misconfig) return misconfig;

  const method = core.normalizeMethod(event.httpMethod);

  // Preflight CORS support.  Return early on OPTIONS requests.
  if (method === 'OPTIONS') {
    return core.respond(event, 204, 'text/plain; charset=utf-8', '', {
      'Access-Control-Max-Age': '86400',
    });
  }

  try {
    const subPath = core.getSubPath(event);
    const segments = core.splitPath(subPath);
    const head = String(segments[0] || '').trim();

    // Build authentication context.  For public routes (health, public-pages)
    // the auth module returns disabled contexts or null.
    const authCtx = await auth.buildAuthContext(event, head, method);
    if (authCtx && authCtx.response) return authCtx.response;

    if (!head) return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));

    switch (head) {
      case 'health':
        return routesHealth.handle(event);
      case 'auth':
        return routesAuth.handle(event, segments);
      case 'app-state':
        return routesAppState.handle(event, authCtx);
      case 'session':
        return routesSession.handle(event, authCtx);
      case 'processes':
        return routesProcesses.handle(event, segments, authCtx);
      // case 'auditor':
      //   Removed unused auditor route handler. The auditor API is no longer
      //   implemented and this case previously triggered a recursive call.
      //   Leaving this commented prevents accidental invocation.
      case 'public-pages':
        return routesPublic.handle(event, segments, authCtx);
      case 'public':
        // Handle preview and publish actions for public pages
        return routesPublicExtras.handle(event, segments, authCtx);
      case 'evidences':
        return routesEvidences.handle(event, segments, authCtx);
      case 'companies':
        return routesCompanies.handle(event, authCtx);
      case 'memberships':
        return routesMemberships.handle(event, authCtx, segments);
      case 'assignments':
        return routesAssignments.handle(event, authCtx, segments);
      case 'audit-log':
        // Trilha de auditoria: leitura mínima
        return routesAuditLog.handle(event, authCtx, segments);
      case 'admin':
        // Administrative helpers (resolve user, etc.)
        return routesAdmin.handle(event, segments, authCtx);
      default:
        return core.json(event, 404, core.err('NOT_FOUND', 'Rota não encontrada.'));
    }
  } catch (e) {
    const rid = event && event.__ncs_request_id ? String(event.__ncs_request_id) : '';
    return core.json(event, 500, core.err('INTERNAL', 'Erro inesperado.', { requestId: rid || null }));
  }
};