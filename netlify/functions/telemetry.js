// netlify/functions/telemetry.js
//
// Endpoint de telemetria do selo NCS.
//
// O contrato continua o mesmo: aceita `POST` com qualquer JSON válido
// (objeto ou array), valida o tipo e o tamanho e sempre responde 204
// (ACK‑only).  Diferentemente do protótipo anterior, este handler não
// persiste eventos em banco; em vez disso, ele realiza duas ações:
//  - Filtra o payload para campos permitidos e registra o evento em stdout
//    como um JSON em uma única linha (para facilitar agregação de logs).
//  - Aplica uma amostragem simples: eventos com nível
//    `error` ou `fatal` são sempre registrados; outros níveis são
//    registrados com probabilidade de 10% (ou taxa definida via
//    `NCS_TELEMETRY_SAMPLE_RATE`).
//  - Se a variável de ambiente `ALERT_WEBHOOK_URL` existir e o nível
//    for `error` ou `fatal`, o endpoint envia uma cópia reduzida do
//    evento via POST para esse webhook com timeout curto.  Falhas de
//    envio são silenciosamente ignoradas.

'use strict';

/**
 * Tipos (somente DX via JSDoc; não afeta runtime).
 * @typedef {import('@netlify/functions').HandlerEvent} NetlifyEvent
 * @typedef {import('@netlify/functions').HandlerResponse} NetlifyResponse
 */

const MAX_BODY_BYTES = 80_000; // 80 KB

// Campos aceitos no payload.  Qualquer outra chave será descartada
// silenciosamente para evitar drift de esquema e exposição acidental de
// dados sensíveis.  O front envia pelo menos { event, level, message,
// stack, context, ts, brand }.
const ALLOWED_FIELDS = new Set([
  'event',
  'level',
  'message',
  'stack',
  'context',
  'ts',
  'route',
  'version',
  'build',
  'request_id',
  'brand',
]);

// Probabilidade de registro de eventos não críticos.  Pode ser
// configurada via NCS_TELEMETRY_SAMPLE_RATE (ex.: "0.05" para 5%).
function getSampleRate() {
  const v = process.env.NCS_TELEMETRY_SAMPLE_RATE;
  const f = parseFloat(v);
  return Number.isFinite(f) && f >= 0 && f <= 1 ? f : 0.1;
}

/**
 * Filtra um objeto mantendo apenas os campos permitidos.
 * @param {Record<string, any>} obj
 * @returns {Record<string, any>}
 */
function filterPayload(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = obj[k];
  }
  return out;
}

/**
 * Constrói um objeto de log a partir do evento recebido e do contexto da
 * requisição.
 *
 * @param {Record<string, any>} evt
 * @param {import('@netlify/functions').HandlerEvent} request
 * @returns {Record<string, any>}
 */
function buildLogEntry(evt, request) {
  const headers = request?.headers || {};
  const ts = new Date().toISOString();
  const level = String(evt?.level || 'info').toLowerCase();
  const route = String(evt?.route || request?.path || '').trim();
  const version =
    process.env.NCS_BUILD_VERSION ||
    process.env.BUILD_VERSION ||
    process.env.VERSION ||
    (evt?.version || evt?.build || '');
  const requestId = headers['x-request-id'] || headers['x-request-id'.toLowerCase()] || headers['request-id'] || evt?.request_id;
  const brand = evt?.brand || headers['x-ncs-brand'] || headers['x-ncs-brand'.toLowerCase()];
  const base = {
    ts,
    level,
    event: String(evt?.event || 'telemetry').trim(),
    route,
  };
  if (version) base.version = String(version).trim();
  if (requestId) base.request_id = String(requestId).trim();
  if (brand) base.brand = String(brand).trim();
  return base;
}

/**
 * Envia um alerta reduzido para um webhook externo.
 * @param {Record<string, any>} evt
 * @returns {Promise<void>}
 */
async function sendAlertWebhook(evt) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const level = String(evt?.level || '').toLowerCase();
  if (!(level === 'error' || level === 'fatal')) return;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2000);
    const payload = {
      ts: new Date().toISOString(),
      level,
      event: evt.event || '',
      message: evt.message || '',
      brand: evt.brand || '',
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(timeout);
  } catch {
    // fail silent
  }
}

/** Headers comuns (CORS + no-store). */
const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

/**
 * Lê header de forma case-insensitive.
 * @param {Record<string, any> | undefined | null} headers
 * @param {string} name
 * @returns {any}
 */
function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

/**
 * Decodifica body do Netlify event (base64 ou texto).
 * @param {NetlifyEvent} event
 * @returns {string}
 */
function decodeBody(event) {
  if (!event || typeof event.body !== 'string') return '';
  if (event.isBase64Encoded) {
    try {
      return Buffer.from(event.body, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return event.body;
}

/**
 * JSON.parse seguro.
 * @param {string} str
 * @returns {any | null}
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Monta resposta JSON padrão.
 * @param {number} statusCode
 * @param {any} payload
 * @returns {NetlifyResponse}
 */
function json(statusCode, payload) {
  return {
    statusCode,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    body: JSON.stringify(payload),
  };
}

/**
 * Handler do endpoint de telemetria (evento único).
 * @param {NetlifyEvent} event
 * @returns {Promise<NetlifyResponse>}
 */
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: BASE_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const ct = String(getHeader(event.headers, 'content-type') || '');
  if (ct && !ct.includes('application/json')) {
    return json(415, { error: 'Unsupported Media Type: expected application/json' });
  }

  const raw = decodeBody(event);
  const bytes = Buffer.byteLength(raw || '', 'utf8');

  if (bytes > MAX_BODY_BYTES) {
    return json(413, { error: 'Payload muito grande.' });
  }

  const body = safeJsonParse(raw || '');

  // Aceita apenas JSON que resulte em objeto ou array (typeof === 'object' && != null).
  // JSON primitivos (string/number/bool/null) são rejeitados.
  if (body === null || typeof body !== 'object') {
    return json(400, { error: 'Invalid payload' });
  }

  // Normaliza para lista de eventos
  const events = Array.isArray(body) ? body : [body];
  const sampleRate = getSampleRate();
  for (const evtRaw of events) {
    if (!evtRaw || typeof evtRaw !== 'object') continue;
    const evt = filterPayload(evtRaw);
    const level = String(evt.level || 'info').toLowerCase();
    // Amostragem: registra tudo se error/fatal; caso contrário, aplica taxa
    const shouldLog = level === 'error' || level === 'fatal' || Math.random() < sampleRate;
    if (shouldLog) {
      const logEntry = buildLogEntry(evt, event);
      try {
        console.log(JSON.stringify({ ...logEntry, ...evt }));
      } catch {
        // nunca quebra a requisição
      }
    }
    // Notifica webhook se for erro crítico
    await sendAlertWebhook(evt).catch(() => {});
  }
  // Sempre responde 204 como ACK
  return { statusCode: 204, headers: BASE_HEADERS, body: '' };
};
