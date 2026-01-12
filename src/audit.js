/**
 * @file src/audit.js
 * @overview
 * audit.js — Utilitários de log de auditoria (protótipo NCS)
 *
 * Objetivos (higiene + backend-friendly + UX):
 * - API pequena e previsível:
 *   - addAuditLog(eventType, payload?, opts?)   -> registra 1 evento
 *   - renderAuditLog(targetElementId, opts?)   -> renderiza lista no DOM
 *   - exportAuditLog(format?, opts?)           -> exporta JSON/CSV/HTML (string)
 * - Normalização defensiva do shape (compat com dados legados).
 * - ID robusto (crypto.randomUUID quando disponível) + timestamps ISO consistentes.
 * - Payload serializável e “bounded” (evita circular refs, BigInt, DOM nodes, blobs gigantes).
 * - Render acessível e performático (DocumentFragment; sem innerHTML perigoso).
 * - Export seguro:
 *   - CSV com escaping e mitigação de “CSV injection” (Excel/Sheets).
 *   - HTML export com escaping (evita injeção).
 *
 * Observação importante:
 * - O log é armazenado em memória local (`_auditLog`).
 * - Mantém compatibilidade com uso existente: addAuditLog('evento', payload)
 */

import { safeStr, escapeHtml } from './shared/ui.js';
// The audit log is no longer persisted in a client‑side store.  Instead this
// module maintains an in‑memory array of entries.  Consumers should
// persist audit events via backend APIs (if needed) outside of this module.

// In‑memory array holding all audit entries for the current session.  This
// replaces the previous use of a persistent UI store.
const _auditLog = [];

/* ==========================================================================
  Tipagem leve (JSDoc)
============================================================================ */

/**
 * @typedef {Object} AuditEntry
 * @property {string} id        ID do evento
 * @property {string} ts        Timestamp ISO (UTC)
 * @property {string} event     Tipo do evento (rótulo curto)
 * @property {any} payload      Payload serializável (ou null)
 */

/**
 * @typedef {Object} AddAuditOptions
 * @property {string=} idPrefix          Prefixo usado no fallback de ID (quando sem randomUUID)
 * @property {boolean=} persist          Se true, tenta persistir (default: true)
 * @property {number=} maxEntries        Se > 0, limita o tamanho do auditLog (mantém os mais recentes)
 */

/**
 * @typedef {Object} RenderAuditOptions
 * @property {number=} limit             Máximo de itens renderizados
 * @property {boolean=} newestFirst       Ordena mais recentes primeiro (default: true)
 */

/**
 * @typedef {Object} ExportAuditOptions
 * @property {boolean=} newestFirst       Ordena mais recentes primeiro (default: true)
 * @property {number=} limit             Limite de itens exportados
 * @property {string=} title             Título do HTML export
 */

/* ==========================================================================
  Config padrão (pode ser ajustado via setAuditConfig)
============================================================================ */

const DEFAULT_CONFIG = {
  /** @type {number} */
  maxEntries: 1000, // alto o suficiente para protótipo, mas evita “crescimento infinito”.
  /** @type {number} */
  maxPayloadChars: 60_000, // payload serializado (aprox.) para não explodir localStorage/render
  /** @type {number} */
  maxDepth: 6, // profundidade máxima ao “sanitizar” objetos
};

let config = { ...DEFAULT_CONFIG };

/**
 * Ajusta configurações do audit (opcional).
 * Não é necessário para o uso normal, mas ajuda em demos / ambientes com storage restrito.
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} partial
 */
export function setAuditConfig(partial = {}) {
  if (!partial || typeof partial !== 'object') return;
  const next = { ...config };

  if (Number.isFinite(Number(partial.maxEntries))) next.maxEntries = Math.max(0, Math.floor(Number(partial.maxEntries)));
  if (Number.isFinite(Number(partial.maxPayloadChars)))
    next.maxPayloadChars = Math.max(1000, Math.floor(Number(partial.maxPayloadChars)));
  if (Number.isFinite(Number(partial.maxDepth))) next.maxDepth = Math.max(1, Math.floor(Number(partial.maxDepth)));

  config = next;
}

/** @returns {typeof DEFAULT_CONFIG} */
export function getAuditConfig() {
  return { ...config };
}

/* ==========================================================================
  Helpers internos (robustez / compat)
============================================================================ */

/** @param {any} x @returns {boolean} */
function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** @param {any} x @param {string} [fallback=''] @returns {string} */
// safeStr is now imported from './shared/ui.js'

/** @returns {string} */
function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

/** @param {string} [prefix='log'] @returns {string} */
function generateId(prefix = 'log') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${safeStr(prefix, 'log')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Garante que o audit log esteja inicializado em memória e retorna SEMPRE
 * a mesma referência do array em memória.
 *
 * @returns {AuditEntry[]}
 */
function getAuditArray() {
  return _auditLog;
}

/**
 * Tenta extrair timestamp numérico robusto.
 * @param {any} ts
 * @returns {number}
 */
function parseTime(ts) {
  try {
    const t = Date.parse(String(ts || ''));
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

/** @param {AuditEntry} a @param {AuditEntry} b */
function sortNewestFirst(a, b) {
  return parseTime(b?.ts) - parseTime(a?.ts);
}

/** @param {AuditEntry} a @param {AuditEntry} b */
function sortOldestFirst(a, b) {
  return parseTime(a?.ts) - parseTime(b?.ts);
}

/**
 * Converte ISO em “dd/mm/aaaa às hh:mm” pt-BR (resiliente).
 * @param {any} isoLike
 * @returns {string}
 */
function formatDateTimePtBr(isoLike) {
  try {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return safeStr(isoLike, '—');
    const date = d.toLocaleDateString('pt-BR');
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date} às ${time}`;
  } catch {
    return safeStr(isoLike, '—');
  }
}

/**
 * Escape mínimo para HTML export (evita injeção no relatório exportado).
 * @param {any} text
 * @returns {string}
 */
// escapeHtml is now imported from './shared/ui.js'

/**
 * JSON stringify resiliente (BigInt, errors, etc.)
 * @param {any} value
 * @returns {string}
 */
function toJsonString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    // tenta fallback: BigInt e outros
    try {
      return JSON.stringify(
        value,
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      );
    } catch {
      return safeStr(value, '');
    }
  }
}

/**
 * Mitigação de CSV injection (Excel/Sheets):
 * - Se o valor começa com = + - @, prefixa com apostrofo.
 * @param {string} s
 * @returns {string}
 */
function preventCsvInjection(s) {
  const v = String(s ?? '');
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

/**
 * CSV escaping padrão (aspas duplas + duplicação de aspas).
 * @param {any} value
 * @returns {string}
 */
function csvEscape(value) {
  const s = preventCsvInjection(String(value ?? ''));
  return `"${s.replace(/"/g, '""')}"`;
}

/* ==========================================================================
  Payload sanitization (bounded + serializável)
============================================================================ */

/**
 * Sanitiza um valor para ser persistível/serializável:
 * - remove ciclos
 * - evita functions/symbols
 * - converte BigInt para string
 * - reduz objetos “estranhos” (DOM nodes, File/Blob, Error) para shape simples
 * - limita profundidade (config.maxDepth)
 *
 * @param {any} input
 * @param {number} depth
 * @param {WeakSet<object>} seen
 * @returns {any}
 */
function sanitizeValue(input, depth, seen) {
  if (input == null) return null;

  const t = typeof input;

  // primitives
  if (t === 'string' || t === 'number' || t === 'boolean') return input;
  if (t === 'bigint') return input.toString();
  if (t === 'symbol' || t === 'function') return undefined;

  // depth limit
  if (depth <= 0) return '[Truncated]';

  // objects
  if (t === 'object') {
    // circular
    try {
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
    } catch {
      // ignore WeakSet issues (ex.: non-extensible objects)
    }

    // Error
    if (input instanceof Error) {
      return { name: input.name, message: input.message, stack: safeStr(input.stack) };
    }

    // File/Blob (quando existir)
    try {
      // Blob existe no browser; evita dependência em runtime
      if (typeof Blob !== 'undefined' && input instanceof Blob) {
        const anyBlob = /** @type {any} */ (input);
        return {
          _type: anyBlob?.type ? 'Blob' : 'BlobLike',
          mimeType: safeStr(anyBlob?.type),
          size: typeof anyBlob?.size === 'number' ? anyBlob.size : undefined,
        };
      }
    } catch {
      // ignore
    }

    // DOM node (reduce)
    try {
      if (typeof Node !== 'undefined' && input instanceof Node) {
        const el = /** @type {any} */ (input);
        return {
          _type: 'DOMNode',
          nodeName: safeStr(el?.nodeName),
          id: safeStr(el?.id),
          className: safeStr(el?.className),
        };
      }
    } catch {
      // ignore
    }

    // Array
    if (Array.isArray(input)) {
      const out = [];
      for (let i = 0; i < input.length; i++) {
        const v = sanitizeValue(input[i], depth - 1, seen);
        if (v !== undefined) out.push(v);
      }
      return out;
    }

    // Plain-ish object: copy enumerable keys
    const out = {};
    try {
      for (const k of Object.keys(input)) {
        const v = sanitizeValue(input[k], depth - 1, seen);
        if (v !== undefined) out[k] = v;
      }
      return out;
    } catch {
      // última saída para objetos host
      return safeStr(input, '');
    }
  }

  // fallback
  return safeStr(input, '');
}

/**
 * Serializa payload com limite de tamanho e retorno “limpo” (JSON-safe).
 * @param {any} payload
 * @returns {any}
 */
function safeSerializePayload(payload) {
  if (payload == null) return null;

  // sanitiza mantendo estrutura
  let sanitized = null;
  try {
    sanitized = sanitizeValue(payload, config.maxDepth, new WeakSet());
  } catch {
    sanitized = null;
  }

  // valida serialização e limita tamanho
  try {
    const json = JSON.stringify(sanitized);
    if (typeof json === 'string' && json.length > config.maxPayloadChars) {
      return {
        _truncated: true,
        preview: json.slice(0, Math.max(0, config.maxPayloadChars - 200)),
        note: 'Payload truncado para preservar performance/persistência.',
      };
    }
    return JSON.parse(json);
  } catch {
    // fallback final
    return safeStr(payload, '');
  }
}

/* ==========================================================================
  Normalização de entrada (compat)
============================================================================ */

/**
 * Normaliza o shape do entry (compat).
 * Aceita entradas antigas com { ts } ou { date } etc.
 *
 * @param {any} raw
 * @returns {AuditEntry}
 */
function normalizeEntry(raw) {
  const obj = isPlainObject(raw) ? raw : {};

  const id = safeStr(obj.id, '') || generateId();
  const ts = safeStr(obj.ts || obj.date || obj.timestamp, '') || nowIso();
  const event = safeStr(obj.event || obj.action || obj.type, 'event');

  const payload =
    obj.payload !== undefined
      ? obj.payload
      : obj.meta !== undefined
        ? obj.meta
        : obj.data !== undefined
          ? obj.data
          : null;

  return {
    id,
    ts,
    event,
    // Importante: normalizar entradas antigas também (export/render não pode quebrar).
    payload: safeSerializePayload(payload),
  };
}

/**
 * Faz “trim” do auditLog (mantém mais recentes).
 * @param {AuditEntry[]} listRef
 * @param {number} maxEntries
 */
function pruneAuditLog(listRef, maxEntries) {
  const max = Number.isFinite(Number(maxEntries)) ? Math.max(0, Math.floor(Number(maxEntries))) : 0;
  if (!max) return;
  if (listRef.length <= max) return;

  // Mantém “mais recentes” por timestamp. Como listRef é a referência do store, muta in-place.
  const sorted = listRef.map(normalizeEntry).sort(sortNewestFirst);
  const keep = sorted.slice(0, max);

  listRef.length = 0;
  keep
    .sort(sortOldestFirst) // regrava em ordem cronológica “natural” para facilitar debug
    .forEach((e) => listRef.push(e));
}

/* ==========================================================================
  API Pública
============================================================================ */

/**
 * Registra um evento no auditLog.
 *
 * Compat:
 * - addAuditLog('evento', payload) continua funcionando.
 * - `opts` é opcional e não quebra consumers antigos.
 *
 * @param {string} eventType Rótulo curto do evento (ex.: 'submit', 'change-status', 'add-evidence').
 * @param {any} payload Dados opcionais (serializável).
 * @param {AddAuditOptions=} opts
 * @returns {AuditEntry} Entry criado.
 */
export function addAuditLog(eventType, payload = null, opts = {}) {
  // Use the in‑memory audit log array directly.  No interaction with a
  // client‑side store occurs here.
  const list = _auditLog;

  const entry = normalizeEntry({
    id: generateId(safeStr(opts?.idPrefix, 'log')),
    ts: nowIso(),
    event: safeStr(eventType, 'event'),
    payload, // normalizeEntry já serializa com segurança
  });

  list.push(entry);

  // Trim (protege performance/persistência)
  const maxEntries = Number.isFinite(Number(opts?.maxEntries)) ? Number(opts.maxEntries) : config.maxEntries;
  pruneAuditLog(list, maxEntries);

  // Persistência defensiva: anteriormente salvávamos a store aqui.  Como
  // não há mais store local, esta operação é um noop.  Opcionalmente, a
  // aplicação pode enviar o log ao backend fora deste módulo.

  return entry;
}

/**
 * Renderiza o auditLog dentro de um container.
 *
 * Regras:
 * - Limpa e re-renderiza (estado derivado do store)
 * - Ordem: mais recentes primeiro (default)
 * - Acessibilidade: usa <ul role="list"> e textos claros
 * - Segurança: sem innerHTML; payload vai em textContent
 *
 * @param {string} targetElementId id do elemento container
 * @param {RenderAuditOptions=} opts
 */
export function renderAuditLog(targetElementId, opts = {}) {
  // Guard para SSR/tests
  if (typeof document === 'undefined') return;

  const container = document.getElementById(String(targetElementId || ''));
  if (!container) return;

  const newestFirst = opts?.newestFirst !== false;
  const limit = Number.isFinite(Number(opts?.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : null;

  // Read from the in‑memory audit log.  There is no dependency on any external store.
  const raw = _auditLog;
  const list = raw.map(normalizeEntry).sort(newestFirst ? sortNewestFirst : sortOldestFirst);
  const view = limit ? list.slice(0, limit) : list;

  // Limpa de forma segura
  while (container.firstChild) container.removeChild(container.firstChild);

  if (view.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nenhum log de auditoria.';
    container.appendChild(empty);
    return;
  }

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'list');
  ul.className = 'audit-list';

  const frag = document.createDocumentFragment();

  view.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'audit-item';

    const title = document.createElement('h4');
    title.textContent = safeStr(entry.event, 'Evento');
    li.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'audit-meta';
    meta.textContent = formatDateTimePtBr(entry.ts);
    li.appendChild(meta);

    if (entry.payload !== null && entry.payload !== undefined) {
      const details = document.createElement('pre');
      details.className = 'audit-payload';
      details.style.marginTop = '0.35rem';

      // JSON “bonito” sem quebrar
      try {
        details.textContent = JSON.stringify(entry.payload, null, 2);
      } catch {
        details.textContent = safeStr(entry.payload, '');
      }

      li.appendChild(details);
    }

    frag.appendChild(li);
  });

  ul.appendChild(frag);
  container.appendChild(ul);
}

/**
 * Exporta o auditLog no formato escolhido.
 *
 * Notas:
 * - `csv`: inclui mitigação de CSV injection.
 * - `html`: documento completo, com <pre> para payload.
 * - `json`: default; sempre tenta retornar string válida.
 *
 * @param {'json'|'csv'|'html'} format
 * @param {ExportAuditOptions=} opts
 * @returns {string}
 */
export function exportAuditLog(format = 'json', opts = {}) {
  // Read from the in‑memory audit log array.  No client‑side store is consulted.
  const raw = _auditLog;
  const newestFirst = opts?.newestFirst !== false;

  let list = raw.map(normalizeEntry).sort(newestFirst ? sortNewestFirst : sortOldestFirst);

  const limit = Number.isFinite(Number(opts?.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 0;
  if (limit) list = list.slice(0, limit);

  const fmt = safeStr(format, 'json').toLowerCase();

  if (fmt === 'csv') {
    const header = ['id', 'timestamp', 'event', 'payload'];
    const rows = list.map((e) => {
      const payloadStr = toJsonString(e.payload);
      return [e.id, e.ts, e.event, payloadStr].map(csvEscape).join(',');
    });
    return [header.join(','), ...rows].join('\n');
  }

  if (fmt === 'html') {
    const title = safeStr(opts?.title, 'Log de Auditoria — NCS');

    const rows = list
      .map((e) => {
        const payloadStr = escapeHtml(toJsonString(e.payload));
        return `<tr>
  <td>${escapeHtml(e.id)}</td>
  <td>${escapeHtml(e.ts)}</td>
  <td>${escapeHtml(e.event)}</td>
  <td><pre style="margin:0;white-space:pre-wrap">${payloadStr}</pre></td>
</tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:16px;color:#111;}
    h1{font-size:18px;margin:0 0 8px;}
    p{color:#667085;margin:0 0 14px;}
    table{border-collapse:collapse;width:100%;}
    th,td{border:1px solid #e4e7ec;padding:8px;text-align:left;vertical-align:top;}
    th{background:#f9fafb;font-weight:700;}
    pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.35;}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Exportado em ${escapeHtml(nowIso())}${limit ? ` • limite: ${escapeHtml(String(limit))}` : ''}</p>
  <table>
    <thead>
      <tr><th>ID</th><th>Timestamp</th><th>Evento</th><th>Payload</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }

  // json (default)
  try {
    return JSON.stringify(list, null, 2);
  } catch {
    return '[]';
  }
}
