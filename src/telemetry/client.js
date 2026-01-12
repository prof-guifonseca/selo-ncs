// src/telemetry/client.js
//
// Módulo de telemetria do front.  Este arquivo captura erros
// globais (`window.onerror`) e rejeições não tratadas (`unhandledrejection`),
// normaliza a mensagem/stack e envia um evento para o endpoint
// `/api/telemetry`.  Os eventos são deduplicados para evitar loops.
//
// Para desativar a captura basta definir `window.__NCS_TELEMETRY_OFF__ = true`
// (ou `NCS_TELEMETRY_OFF` equivalente no escopo global).  O módulo
// exporta apenas a função `initTelemetry()` que deve ser chamada uma única
// vez no bootstrap do aplicativo.

import { state, getRole } from '../state.js';
import { resolveBrand } from '../brand.js';

/**
 * Conjunto de chaves de eventos já enviados.  Usado para deduplicar
 * mensagens idênticas dentro do mesmo ciclo de vida da página.
 * @type {Set<string>}
 */
const sent = new Set();

/**
 * Normaliza um erro ou objeto razoável para um payload de telemetria.
 * Mensagens longas e stacks são truncadas para reduzir o tamanho do
 * payload.  Sempre inclui contexto de navegação e papel do usuário.
 *
 * @param {any} err
 * @returns {Record<string, any>}
 */
function normalizeError(err) {
  let message = '';
  let stack = '';
  try {
    if (err instanceof Error) {
      message = String(err.message || '').trim();
      stack = String(err.stack || '').trim();
    } else if (typeof err === 'string') {
      message = err.trim();
    } else if (err && typeof err === 'object') {
      message = String(err.message || err.toString() || '').trim();
      stack = String(err.stack || '').trim();
    } else {
      message = String(err).trim();
    }
  } catch {
    message = 'Unknown error';
  }
  // Truncar para evitar payloads gigantes
  const MAX_MSG_LEN = 200;
  const MAX_STACK_LEN = 1500;
  if (message.length > MAX_MSG_LEN) message = message.slice(0, MAX_MSG_LEN);
  if (stack.length > MAX_STACK_LEN) stack = stack.slice(0, MAX_STACK_LEN);
  const ts = new Date().toISOString();
  let pathname = '';
  try {
    pathname = window.location && window.location.pathname ? window.location.pathname : '';
  } catch {}
  let view = '';
  try {
    view = state.currentView || '';
  } catch {}
  let role = '';
  try {
    role = getRole();
  } catch {}
  let brand = '';
  try {
    brand = resolveBrand();
  } catch {}
  const version = (typeof window !== 'undefined' && window.__NCS_BUILD && window.__NCS_BUILD.version) || '';
  return {
    event: 'frontend-error',
    level: 'error',
    message,
    stack,
    ts,
    brand,
    version,
    route: pathname,
    context: { pathname, view, role, brand },
  };
}

/**
 * Envia um payload de telemetria para o backend, deduplicando mensagens
 * idênticas.  A deduplicação utiliza a combinação de mensagem e stack.
 * Falhas no envio são ignoradas silenciosamente.
 *
 * @param {Record<string, any>} payload
 */
function sendTelemetry(payload) {
  try {
    const dedupeKey = `${payload.message || ''}|${payload.stack || ''}`;
    if (sent.has(dedupeKey)) return;
    sent.add(dedupeKey);
    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // nunca quebra a aplicação
  }
}

/**
 * Inicializa a captura de telemetria.  Não faz nada se o código estiver
 * rodando fora do navegador ou se a flag de desativação estiver definida
 * (window.__NCS_TELEMETRY_OFF__).  O bootstrap deve chamar esta função
 * exatamente uma vez.
 */
export function initTelemetry() {
  if (typeof window === 'undefined') return;
  try {
    if (window.__NCS_TELEMETRY_OFF__ || window.NCS_TELEMETRY_OFF) return;
  } catch {
    // ignore
  }
  // Captura erros globais
  window.addEventListener('error', (ev) => {
    try {
      const err = ev?.error || ev?.message;
      const payload = normalizeError(err);
      sendTelemetry(payload);
    } catch {
      // ignore
    }
  });
  // Captura rejeições não tratadas
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev?.reason;
      const payload = normalizeError(reason);
      sendTelemetry(payload);
    } catch {
      // ignore
    }
  });
}
