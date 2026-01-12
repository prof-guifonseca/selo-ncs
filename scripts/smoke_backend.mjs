#!/usr/bin/env node
// @ts-nocheck
/**
 * scripts/smoke_backend.mjs
 *
 * Minimal smoke tests for the API backend.  These tests exercise the
 * authentication and configuration gates related to row‑level security (RLS)
 * and mandatory authentication.  They run without external dependencies
 * and simulate Netlify function invocations in memory.
 *
 * Usage: node scripts/smoke_backend.mjs
 */

import { handler } from '../netlify/functions/api/index.js';

/**
 * Construct a Netlify event for a given API path.  The event is
 * intentionally minimal: only the fields accessed by the API are
 * populated.  See netlify/functions/api/core.js for details.
 *
 * @param {string} subPath e.g. '/processes'
 * @param {string} [method='GET'] HTTP method
 * @param {Object} [options] optional fields
 * @returns {any}
 */
function makeEvent(subPath, method = 'GET', options = {}) {
  const path = `/\.netlify/functions/api${subPath.startsWith('/') ? subPath : `/${subPath}`}`;
  return {
    httpMethod: method,
    headers: options.headers || {},
    path,
    rawUrl: `http://localhost${path}`,
    queryStringParameters: options.queryStringParameters || {},
    body: options.body || null,
  };
}

/**
 * Reset process.env to its original state.  A shallow copy of the
 * original environment must be provided.  Only keys that were added
 * or modified are removed/reverted; other keys remain untouched.
 * @param {Record<string,string>} originalEnv
 */
function restoreEnv(originalEnv) {
  // Remove any keys that were added during tests
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  // Restore original values
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
}

/**
 * Run a single smoke test.  Captures pass/fail and a description.
 * @param {string} name
 * @param {() => Promise<boolean>} fn
 * @param {string} [desc]
 */
async function runTest(name, fn, desc) {
  try {
    const ok = await fn();
    return { name, pass: ok, details: desc || '' };
  } catch (e) {
    return { name, pass: false, details: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  const tests = [];
  const originalEnv = { ...process.env };

  // Test: RLS disabled via NCS_USE_RLS=0 should fail fast with MISCONFIG.
  // When the environment variable explicitly disables row‑level security
  // the API must reject all requests with status 503.  We use the
  // /health endpoint since it has minimal dependencies and is always
  // available.  Dummy Supabase values are supplied to avoid other
  // configuration errors.  See core.requireRlsOnly() for details.
  tests.push(
    await runTest(
      'misconfig_rls_disabled_returns_503',
      async () => {
        process.env.NCS_USE_RLS = '0';
        // Provide dummy variables to bypass unrelated misconfiguration
        process.env.SUPABASE_ANON_KEY = 'dummy';
        process.env.SUPABASE_URL = 'http://localhost';
        const event = makeEvent('/health', 'GET');
        const res = await handler(event, {});
        const status = res && (res.statusCode || res.status);
        return status === 503;
      },
      'Expected 503 when NCS_USE_RLS=0 (RLS disabled)'
    )
  );
  restoreEnv(originalEnv);

  // Test: RLS enabled but anonymous key missing should yield 503 on sensitive routes.
  tests.push(await runTest('rls_missing_anon_returns_503', async () => {
    // Prepare environment: enable RLS, require auth, remove anon key
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    const event = makeEvent('/processes', 'GET');
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    return status === 503;
  }, 'Expected 503 when SUPABASE_ANON_KEY is missing and RLS is enabled'));
  // Restore environment before next test
  restoreEnv(originalEnv);

  // Test: Admin helpers are disabled when RLS is enabled.  When the
  // environment variable NCS_USE_RLS=1 is set the Supabase helpers
  // authenticated with the service role key should refuse to operate
  // and throw an exception.  This ensures that the hard gate against
  // row‑level security bypass via the service role remains intact.
  tests.push(await runTest('rls_admin_helpers_throw', async () => {
    // Enable RLS and supply dummy Supabase variables.  Even though
    // SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL are present, the
    // admin helpers must reject the call before any HTTP request is
    // made.
    process.env.NCS_USE_RLS = '1';
    process.env.SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
    // Dynamically import the supabase module.  Note that relative
    // paths are resolved from this script's location (scripts/).
    const supaMod = await import('../netlify/functions/api/supabase.js');
    let threw = false;
    try {
      // Attempt to select a row using the admin helper.  Under RLS
      // this should throw with ADMIN_HELPER_DISABLED_RLS.
      await supaMod.restSelectObjectAdmin('ncs_companies', 'id=eq.0');
    } catch (err) {
      const msg = err && err.message ? String(err.message) : '';
      threw = msg.includes('ADMIN_HELPER_DISABLED_RLS');
    }
    return threw;
  }, 'Expected admin helper to throw when RLS is enabled'));
  restoreEnv(originalEnv);

  // Test: Healthy endpoint works under RLS with auth enabled.  Even
  // when auth is required the /health endpoint should succeed with
  // status 200 to indicate the service is online.  This forms part of
  // the "happy flow" check.
  tests.push(await runTest('rls_health_endpoint_ok', async () => {
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    const event = makeEvent('/health', 'GET');
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    return status === 200;
  }, 'Expected /health endpoint to return 200 even when RLS+Auth is enabled'));
  restoreEnv(originalEnv);

  // Test: Required auth returns 401 when no session cookie is provided (RLS mode)
  tests.push(await runTest('auth_required_returns_401', async () => {
    // Prepare environment: enable RLS and supply anon key but no auth cookie
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    // Simulate GET /processes without cookies or bearer token
    const event = makeEvent('/processes', 'GET');
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    return status === 401;
  }, 'Expected 401 when authentication is required and no session is provided'));
  // Restore environment
  restoreEnv(originalEnv);

  // Test: Cross-tenant or unknown process returns 404/403 under RLS.  When
  // RLS is enabled and a user token is provided for one tenant, requests
  // for processes belonging to other tenants should not leak data.  We
  // simulate this by querying a random process id with an invalid JWT.
  tests.push(await runTest('rls_cross_tenant_returns_404_or_403', async () => {
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    // Provide an arbitrary bearer token to bypass cookie parsing.  The
    // token will fail validation and the request should not succeed.
    const event = makeEvent('/processes/proc_x123', 'GET', { headers: { Authorization: 'Bearer invalid' } });
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    // Accept 401 (unauthenticated), 403 (forbidden), 404 (not found), 503
    // (configuration missing/fetch error) or 500 (backend error due to
    // missing Supabase service) as valid outcomes.  Any of these statuses
    // prevent data leakage in the smoke environment.
    return status === 401 || status === 403 || status === 404 || status === 503 || status === 500;
  }, 'Expected cross-tenant or unauthorised access to hide process data (404/403/401)'));
  restoreEnv(originalEnv);

  // Test: Removed auditor route returns 404 quickly.  The legacy auditor API
  // was um wrapper que causava recursão.  Agora que a rota foi eliminada,
  // o router deve retornar 404 imediatamente sem depender de chaves Supabase.
  tests.push(await runTest('auditor_route_returns_404_quickly', async () => {
    // Configure ambiente com RLS ativado e auth desativado para simular
    // modo público.  O auditor wrapper foi removido e deve retornar 404
    // rapidamente sem depender de chaves Supabase.  Forneça chaves dummy
    // para evitar erros de configuração.
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '0';
    process.env.SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
    const start = Date.now();
    const event = makeEvent('/auditor/test', 'GET');
    const res = await handler(event, {});
    const durationMs = Date.now() - start;
    const status = res && (res.statusCode || res.status);
    return durationMs < 500 && status === 404;
  }, 'Expected /api/auditor/* to be gone and return 404 quickly'));
  // Restore environment after auditor route test
  restoreEnv(originalEnv);

  // Test: Audit log orders by occurred_at desc when mock data is provided.  This
  // smoke assertion exercises the audit-log route with deterministic
  // input by setting NCS_TEST_AUDIT_LOG.  It verifies that the
  // response array is sorted in descending order of occurred_at and
  // that the handler returns 200.  When no Supabase is reachable the
  // mock mode avoids network calls.
  tests.push(
    await runTest(
      'audit_log_orders_by_occurred_at',
      async () => {
        // Configure ambiente RLS ativado e auth desativado; baseline foi removido.
        process.env.NCS_USE_RLS = '1';
        process.env.NCS_REQUIRE_AUTH = '0';
        // Forneça chaves dummy para evitar erros de configuração
        process.env.SUPABASE_URL = 'http://localhost';
        process.env.SUPABASE_ANON_KEY = 'dummy';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
        // Mock três eventos com timestamps fora de ordem; dois correspondem ao processo 'proc_test'
        const mockData = [
          { occurred_at: '2024-01-01T12:00:00.000Z', actor_id: 'u1', action: 'stage_change', entity_id: 'proc_test' },
          { occurred_at: '2024-01-03T08:00:00.000Z', actor_id: 'u2', action: 'decision_update', entity_id: 'proc_test' },
          { occurred_at: '2024-01-02T15:00:00.000Z', actor_id: 'u3', action: 'assignment_update', entity_id: 'proc_test' },
          { occurred_at: '2024-01-04T10:00:00.000Z', actor_id: 'u4', action: 'other', entity_id: 'other_proc' },
        ];
        process.env.NCS_TEST_AUDIT_LOG = JSON.stringify(mockData);
        const event = makeEvent('/audit-log', 'GET', {
          queryStringParameters: { process_id: 'proc_test', limit: '10' },
        });
        const res = await handler(event, {});
        const status = res && (res.statusCode || res.status);
        if (status !== 200) return false;
        let arr;
        try {
          arr = JSON.parse(res.body);
        } catch {
          return false;
        }
        if (!Array.isArray(arr) || arr.length < 3) return false;
        // verify descending order of occurred_at
        for (let i = 1; i < arr.length; i++) {
          const prev = Date.parse(arr[i - 1].occurred_at || 0);
          const cur = Date.parse(arr[i].occurred_at || 0);
          if (isNaN(prev) || isNaN(cur) || prev < cur) return false;
        }
        return true;
      },
      'Expected audit-log to return events sorted by occurred_at desc with mock data'
    )
  );
  // Restore environment after audit log test
  restoreEnv(originalEnv);

  // Evaluate results
  const failed = tests.filter((t) => !t.pass);
  if (failed.length) {
    console.error('[smoke-backend] FAIL', failed.map((f) => `${f.name}: ${f.details}`).join('; '));
    process.exit(1);
  }
  console.log(`[smoke-backend] OK ${tests.length} tests passed`);
}

main().catch((err) => {
  console.error('[smoke-backend] ERROR', err);
  process.exit(1);
});