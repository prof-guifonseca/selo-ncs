#!/usr/bin/env node
// @ts-nocheck
/**
 * scripts/contract_backend.mjs
 *
 * Suite leve de testes de contrato para o backend da API.  O objetivo
 * é capturar regressões óbvias nas rotas principais sem requerer uma
 * Supabase real.  Os testes cobrem gates de autenticação, parâmetros
 * obrigatórios e comportamento básico de rotas públicas.  Quando a
 * variável de ambiente CONTRACT_BACKEND_LIVE=1 estiver definida e as
 * chaves de Supabase estiverem presentes, testes adicionais são
 * executados contra o banco remoto.
 */

import { handler } from '../netlify/functions/api/index.js';

/**
 * Constrói um evento Netlify para uma determinada sub‑rota.  Este helper
 * espelha o de scripts/smoke_backend.mjs, preenchendo apenas os campos
 * necessários pelo router.
 *
 * @param {string} subPath caminho após /.netlify/functions/api
 * @param {string} [method='GET'] método HTTP
 * @param {object} [options] opções adicionais (headers, query, body)
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
 * Restaura o estado de process.env após modificar chaves durante um teste.
 * Remove as chaves novas e restaura valores antigos.
 * @param {Record<string,string>} originalEnv
 */
function restoreEnv(originalEnv) {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
}

/**
 * Executa um teste assíncrono e captura seu resultado.  Retorna um
 * objeto com o nome, se passou e detalhes de falha.
 * @param {string} name
 * @param {() => Promise<boolean>} fn
 * @param {string} desc
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

  // -------------------------------------------------------------------------
  // Basic contract tests (no Supabase required)
  // -------------------------------------------------------------------------

  // 1. Auth gate: requer autenticação quando NCS_REQUIRE_AUTH=1 e RLS está ligado.
  tests.push(await runTest('auth_gate_requires_session', async () => {
    // Configurar ambiente: RLS ligado, auth requerido, dummy anon key para
    // evitar 503, e URL dummy para evitar fetch real.
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    const event = makeEvent('/processes', 'GET');
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    restoreEnv(originalEnv);
    return status === 401;
  }, 'GET /processes deve retornar 401 sem sessão quando auth é obrigatório'));

  // 2. Missing parameter on publish: retorna 400.
  tests.push(await runTest('publish_requires_process_id', async () => {
    // RLS sempre ativado; desative auth para focar na validação de body.  A rota
    // deve retornar 400 para body sem process_id antes de verificar JWT.
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '0';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    const event = makeEvent('/public/publish', 'POST', { body: JSON.stringify({}) });
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    restoreEnv(originalEnv);
    return status === 400;
  }, 'POST /public/publish deve exigir process_id'));

  // 3. Missing parameter on preview: retorna 400.
  tests.push(await runTest('preview_requires_process_id', async () => {
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '0';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    const event = makeEvent('/public/preview', 'GET', { queryStringParameters: { format: 'json' } });
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    restoreEnv(originalEnv);
    return status === 400;
  }, 'GET /public/preview deve exigir process_id'));

  // 4. Unknown route returns 404.
  tests.push(await runTest('unknown_route_returns_404', async () => {
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '0';
    const event = makeEvent('/unknown-route', 'GET');
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    restoreEnv(originalEnv);
    return status === 404;
  }, 'Rotas inexistentes devem retornar 404'));

  // 5. Cross-tenant requests do not return 200.  Simula token inválido.
  tests.push(await runTest('cross_tenant_not_success', async () => {
    process.env.NCS_USE_RLS = '1';
    process.env.NCS_REQUIRE_AUTH = '1';
    process.env.SUPABASE_ANON_KEY = 'dummy';
    process.env.SUPABASE_URL = 'http://localhost';
    const event = makeEvent('/processes/proc_test', 'GET', { headers: { Authorization: 'Bearer invalid' } });
    const res = await handler(event, {});
    const status = res && (res.statusCode || res.status);
    restoreEnv(originalEnv);
    // Considera PASS qualquer código diferente de 200 para prevenir divulgação
    return status !== 200;
  }, 'Requisição cross‑tenant com token inválido não deve retornar 200'));

  // -------------------------------------------------------------------------
  // Optional live tests (requires real Supabase)
  // -------------------------------------------------------------------------
  const runLive = process.env.CONTRACT_BACKEND_LIVE === '1';
  const supaUrl = process.env.SUPABASE_URL;
  const haveKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (runLive && supaUrl && haveKey) {
    tests.push(await runTest('health_endpoint_live', async () => {
      // Preserve all env; simply call /health
      const event = makeEvent('/health', 'GET');
      const res = await handler(event, {});
      const status = res && (res.statusCode || res.status);
      return status === 200;
    }, 'No modo live, /health deve responder 200'));
  }

  // -------------------------------------------------------------------------
  // Resultado e saída
  // -------------------------------------------------------------------------
  let failCount = 0;
  for (const t of tests) {
    const status = t.pass ? 'PASS' : 'FAIL';
    const extra = t.details ? ` — ${t.details}` : '';
    console.log(`${status}: ${t.name}${extra}`);
    if (!t.pass) failCount++;
  }
  if (failCount > 0) {
    process.exit(1);
  }
  // Se não houve falhas, sai com código 0 (sucesso)
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});