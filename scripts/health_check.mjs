#!/usr/bin/env node
/**
 * scripts/health_check.mjs
 *
 * Utilitário simples para checar a saúde da API (GET /api/health) e gerar
 * evidência operacional (status + tempo de resposta) sem precisar de infra.
 *
 * Uso:
 *   node scripts/health_check.mjs
 *   HEALTH_BASE=https://selo-ncs-staging.netlify.app/.netlify/functions/api node scripts/health_check.mjs
 *
 * Variáveis:
 * - HEALTH_BASE: base da API (default: http://localhost:8888/.netlify/functions/api)
 * - HEALTH_TIMEOUT_MS: timeout em ms (default: 8000)
 */

function getEnv(name) {
  const v = process.env[name];
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normalizeBase(base) {
  // Remove trailing slashes.
  return String(base || '').trim().replace(/\/+$/, '');
}

function buildHealthUrl(base) {
  const b = normalizeBase(base);
  if (!b) return null;

  // Se já vier apontando para /health, respeita.
  if (/\/health$/i.test(b)) return b;

  // Base esperada: .../.netlify/functions/api
  // ou .../api
  return `${b}/health`;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const base = getEnv('HEALTH_BASE') || 'http://localhost:8888/.netlify/functions/api';
  const timeoutMs = Number(getEnv('HEALTH_TIMEOUT_MS') || '8000');

  const url = buildHealthUrl(base);
  if (!url) {
    console.error('[health] HEALTH_BASE inválido');
    process.exit(1);
  }

  const started = Date.now();
  let res;
  try {
    res = await fetchWithTimeout(url, Number.isFinite(timeoutMs) ? timeoutMs : 8000);
  } catch (err) {
    const ms = Date.now() - started;
    const msg = err && err.name === 'AbortError' ? 'TIMEOUT' : (err && err.message ? err.message : String(err));
    console.error(`[health] url=${url} error=${msg} time=${ms}ms`);
    process.exit(1);
  }

  const ms = Date.now() - started;

  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }

  let json = null;
  if (bodyText) {
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = null;
    }
  }

  const ok = res.status === 200 && json && json.ok === true;
  const extra = json ? ` ok=${String(json.ok)} time=${String(json.time || json.ts || '')}` : '';

  const line = `[health] url=${url} status=${res.status} time=${ms}ms${extra ? ' ' + extra : ''}`;
  if (ok) {
    console.log(line);
    process.exit(0);
  }

  console.error(line);
  if (bodyText) {
    // Evita despejar conteúdo enorme em CI.
    const trimmed = bodyText.length > 800 ? bodyText.slice(0, 800) + '…' : bodyText;
    console.error(`[health] body=${trimmed}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
