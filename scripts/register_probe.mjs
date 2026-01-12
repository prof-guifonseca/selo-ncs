#!/usr/bin/env node
/**
 * scripts/register_probe.mjs
 *
 * Script de verificação para o endpoint de auto‑cadastro (/auth/register).
 *
 * Este utilitário realiza duas chamadas HTTP contra o endpoint de registro
 * do ambiente remoto informado por variáveis de ambiente.  O objetivo é
 * demonstrar que:
 * 1) Um payload válido (com termos aceitos) cria um usuário, devolve
 *    status 200 e, quando a sessão imediata está habilitada no backend,
 *    retorna cabeçalhos Set‑Cookie contendo os tokens de acesso/refresh.
 * 2) Um payload inválido (sem aceite dos termos) retorna status 400 e
 *    um corpo JSON com code "TERMS_REQUIRED".
 *
 * Para executar, defina as variáveis de ambiente abaixo e rode
 * `node scripts/register_probe.mjs`.  Se qualquer variável estiver
 * ausente, o script abortará com mensagem clara.  Nenhum JWT ou
 * credencial secreta é exibido em logs.
 *
 * Variáveis obrigatórias:
 * - PROBE_API_BASE: base do endpoint (ex.: https://selo-ncs-staging.netlify.app/.netlify/functions/api)
 * - PROBE_COMPANY_NAME: nome da empresa a ser usado no cadastro
 *
 * Variáveis opcionais:
 * - PROBE_EMAIL: email a ser usado no cadastro (será sobrescrito com sufixo timestamp para evitar colisão)
 *
 * O script utiliza a API nativa `fetch` do Node.js (v18+) para realizar
 * as requisições.  Certifique‑se de estar executando com Node 18 ou
 * superior.  Caso contrário, instale um polyfill de fetch.
 */

// Helper para ler variáveis de ambiente de forma segura.
function getEnv(name) {
  const v = process.env[name];
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function doRegister(apiBase, payload) {
  const url = `${apiBase.replace(/\/+$/, '')}/auth/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  // Captura cookies se disponíveis (node-fetch/undici expõe raw())
  let cookies = [];
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      cookies = res.headers.getSetCookie();
    } else if (res.headers && typeof res.headers.get === 'function') {
      // Fallback: tenta obter múltiplos cookies com .raw() quando suportado
      const raw = typeof res.headers.raw === 'function' ? res.headers.raw() : null;
      if (raw && raw['set-cookie']) {
        cookies = raw['set-cookie'];
      } else {
        const single = res.headers.get('set-cookie');
        if (single) cookies = [single];
      }
    }
  } catch {
    /* ignore */
  }
  return { status: res.status, body, cookies };
}

async function main() {
  const apiBase = getEnv('PROBE_API_BASE');
  const companyName = getEnv('PROBE_COMPANY_NAME');
  const baseEmail = getEnv('PROBE_EMAIL') || 'probe@example.com';

  if (!apiBase || !companyName) {
    console.error('[register_probe] Variáveis obrigatórias não definidas.  Defina PROBE_API_BASE e PROBE_COMPANY_NAME.');
    process.exit(1);
  }

  // Primeira chamada: payload válido com termos aceitos
  const timestamp = Date.now();
  const email = baseEmail.replace(/@/, `+${timestamp}@`);
  const payloadOk = {
    company_name: companyName,
    email,
    password: 'Probe123!',
    accept_terms_platform: true,
    accept_terms_process: true,
  };
  let resultOk;
  try {
    resultOk = await doRegister(apiBase, payloadOk);
  } catch (err) {
    console.error('[register_probe] Erro na requisição válida:', err);
    process.exit(1);
  }
  console.log('--- Registro válido ---');
  console.log('status:', resultOk.status);
  if (resultOk.body && typeof resultOk.body === 'object') {
    console.log('user.id:', resultOk.body?.user?.id || null);
  }
  if (Array.isArray(resultOk.cookies) && resultOk.cookies.length > 0) {
    console.log('Set-Cookie:', resultOk.cookies.map((c) => c.split(';')[0]).join('; '));
  } else {
    console.log('Set-Cookie: (nenhum cookie retornado)');
  }
  console.log('body:', JSON.stringify(resultOk.body));

  // Segunda chamada: payload com termos faltantes
  const payloadBad = {
    company_name: companyName,
    email: baseEmail.replace(/@/, `+bad-${timestamp}@`),
    password: 'Probe123!',
    accept_terms_platform: false,
    accept_terms_process: false,
  };
  let resultBad;
  try {
    resultBad = await doRegister(apiBase, payloadBad);
  } catch (err) {
    console.error('[register_probe] Erro na requisição inválida:', err);
    process.exit(1);
  }
  console.log('--- Registro sem termos ---');
  console.log('status:', resultBad.status);
  console.log('body:', JSON.stringify(resultBad.body));

  // Validação básica dos resultados
  const passStatusOk = resultOk.status === 200;
  const passUserId = !!(resultOk.body && resultOk.body.user && resultOk.body.user.id);
  const passTermsError = resultBad.status === 400 && resultBad.body && resultBad.body.code === 'TERMS_REQUIRED';
  let fails = 0;
  if (!passStatusOk) {
    console.error('[register_probe] FAIL: status esperado 200 na requisição válida');
    fails++;
  }
  if (!passUserId) {
    console.error('[register_probe] FAIL: user.id ausente na resposta válida');
    fails++;
  }
  if (!passTermsError) {
    console.error('[register_probe] FAIL: requisição inválida deveria retornar code TERMS_REQUIRED');
    fails++;
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