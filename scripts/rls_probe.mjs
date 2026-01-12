#!/usr/bin/env node
/**
 * scripts/rls_probe.mjs
 *
 * Utilitário manual para provar isolamento multi‑tenant em staging.  O
 * script realiza chamadas HTTP contra o endpoint /processes do ambiente
 * remoto, comparando o acesso de dois usuários distintos.  O objetivo é
 * demonstrar que cada usuário pode ler apenas seu próprio processo e é
 * barrado quando tenta acessar o processo do outro.
 *
 * Para executar, defina as variáveis de ambiente abaixo e rode
 * `node scripts/rls_probe.mjs`.  Se qualquer variável estiver ausente,
 * o script abortará com mensagem clara.  Nenhum JWT é exibido em logs.
 *
 * Variáveis obrigatórias:
 * - PROBE_API_BASE: base do endpoint (ex.: https://selo-ncs-staging.netlify.app/.netlify/functions/api)
 * - PROBE_TENANT_A_TOKEN: JWT do usuário A
 * - PROBE_TENANT_A_PROCESS_ID: processo pertencente ao usuário A
 * - PROBE_TENANT_B_TOKEN: JWT do usuário B
 * - PROBE_TENANT_B_PROCESS_ID: processo pertencente ao usuário B
 */

// Função auxiliar para ler variáveis de ambiente de forma segura.
function getEnv(name) {
  const v = process.env[name];
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function fetchProcess(apiBase, processId, token) {
  const url = `${apiBase.replace(/\/?$/, '')}/processes/${encodeURIComponent(processId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.status;
}

async function main() {
  const apiBase = getEnv('PROBE_API_BASE');
  const tokenA = getEnv('PROBE_TENANT_A_TOKEN');
  const processA = getEnv('PROBE_TENANT_A_PROCESS_ID');
  const tokenB = getEnv('PROBE_TENANT_B_TOKEN');
  const processB = getEnv('PROBE_TENANT_B_PROCESS_ID');

  // Valida presença de todas as variáveis
  if (!apiBase || !tokenA || !processA || !tokenB || !processB) {
    console.error('[probe] Variáveis obrigatórias não definidas.  Defina PROBE_API_BASE, PROBE_TENANT_A_TOKEN, PROBE_TENANT_A_PROCESS_ID, PROBE_TENANT_B_TOKEN e PROBE_TENANT_B_PROCESS_ID.');
    process.exit(1);
  }

  const results = [];

  // Caso positivo: A acessa A
  try {
    const status = await fetchProcess(apiBase, processA, tokenA);
    const ok = status === 200;
    results.push({ name: 'same-tenant-A', pass: ok, status });
  } catch (err) {
    results.push({ name: 'same-tenant-A', pass: false, status: err && err.message ? err.message : String(err) });
  }

  // Caso negativo: B acessa A
  try {
    const status = await fetchProcess(apiBase, processA, tokenB);
    const ok = status !== 200;
    results.push({ name: 'cross-tenant-B-to-A', pass: ok, status });
  } catch (err) {
    results.push({ name: 'cross-tenant-B-to-A', pass: false, status: err && err.message ? err.message : String(err) });
  }

  // Caso positivo: B acessa B
  try {
    const status = await fetchProcess(apiBase, processB, tokenB);
    const ok = status === 200;
    results.push({ name: 'same-tenant-B', pass: ok, status });
  } catch (err) {
    results.push({ name: 'same-tenant-B', pass: false, status: err && err.message ? err.message : String(err) });
  }

  // Caso negativo: A acessa B
  try {
    const status = await fetchProcess(apiBase, processB, tokenA);
    const ok = status !== 200;
    results.push({ name: 'cross-tenant-A-to-B', pass: ok, status });
  } catch (err) {
    results.push({ name: 'cross-tenant-A-to-B', pass: false, status: err && err.message ? err.message : String(err) });
  }

  let fails = 0;
  for (const r of results) {
    const statusLine = typeof r.status === 'number' ? `status ${r.status}` : r.status;
    const label = r.pass ? 'PASS' : 'FAIL';
    console.log(`${label}: ${r.name} — ${statusLine}`);
    if (!r.pass) fails++;
  }
  if (fails > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});