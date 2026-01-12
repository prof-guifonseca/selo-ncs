/**
 * @fileoverview
 * Geração de relatórios HTML (self-contained) para o protótipo NCS.
 *
 * Este módulo exporta:
 * - generateReportHTML(snapshot?): retorna um documento HTML completo (screen + print).
 * - downloadReportHTML(filename, html): dispara download do HTML (quando em browser).
 * - generateExecutiveSummaryHTML(snapshot?): retorna um bloco HTML (parcial) para dashboard.
 *
 * Diretrizes:
 * - Documento autônomo (sem assets externos).
 * - Escape de HTML para evitar injeção/quebra de layout.
 * - Tolerante a variações de shape em indicadores e evidências; o audit log aceita apenas o formato atual da API ou dos logs locais.
 * - Pode operar com snapshot (sem depender de nenhuma store viva) com KPI “lite”.
 */

// Budget: 1147 linhas — atualize ao modificar (evita inchaço)
import { state as sessionState } from './state.js';
// Import shared helpers (safeStr, escapeHtml) from central module. These were
// previously defined locally in this file.
import { safeStr, escapeHtml } from './shared/ui.js';

/*
 * -----------------------------------------------------------------------------
 * Backend parity constants
 *
 * The report generator relies on `CRITICAL_INDICATOR_IDS` and
 * `DISPARITY_THRESHOLD_PP` to decide when a process requires consensus due to
 * critical conflicts or large score disparities.  These symbols originate in
 * the backend (see `netlify/functions/api/domain.js`) but are not exported
 * through a module that can be imported in the browser.  To avoid
 * ReferenceErrors at runtime and to keep the client and backend logic in
 * sync we define the constants here using the same values.  If the backend
 * rules evolve the arrays/values should be updated correspondingly on both
 * sides.
 */
/** @type {number[]} */
const CRITICAL_INDICATOR_IDS = [10, 11];
/** @type {number} */
const DISPARITY_THRESHOLD_PP = 20;
/* ==========================================================================
  Tipagem leve (JSDoc)
============================================================================ */

/**
 * @typedef {Object} ReportSnapshot
 * @property {any[]=} processes
 * @property {any[]=} indicators
 * @property {any[]=} evidences
 * @property {any[]=} auditLog
 * @property {Record<string, any>=} _meta
 */

/**
 * @typedef {Object} KPIReport
 * @property {number} pendentes
 * @property {number} conformes
 * @property {number} pontos
 * @property {number} scoreTotal
 * @property {{E:number,S:number,G:number}} scorePorPilar
 * @property {{Validado:number,Condicionante:number,Negado:number,Pendente:number,NA:number}} statusCounts
 * @property {boolean} disparity
 * @property {boolean} hasCriticalConflict
 * @property {Record<string, {finalScore: (number|null), finalClass: string, pillar: (string|null)}>} indicatorScores
 * @property {Record<string, boolean>} requiresConsensusById
 */

/* ==========================================================================
  CSS (screen + print)
============================================================================ */

/**
 * CSS unificado (screen + print) para documentos “expedidos” via impressão do navegador.
 * Compatível com Chromium (Chrome/Edge). Evita “margin boxes” avançadas.
 */
const DOCUMENT_STYLES_CSS = `
/* ========================================================================== */
/* NCS — Documento (screen + print)                                            */
/* ========================================================================== */

:root {
  --ink: #101828;
  --muted: #667085;
  --line: #E4E7EC;
  --bg-soft: #F9FAFB;
  --bg-warn: #FFF7E8;
  --border-warn: #FFE2B6;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
}

html, body { height: 100%; }
body {
  font-family: var(--font);
  color: var(--ink);
  margin: 0;
  background: #fff;
}

.ncs-doc {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
}

.doc-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 16px;
}

.doc-brand {
  font-size: 10.5pt;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.doc-title {
  font-size: 15pt;
  font-weight: 800;
  margin-top: 2px;
}

.doc-meta {
  text-align: right;
  font-size: 9.5pt;
  color: var(--muted);
  line-height: 1.3;
}

.doc-body {
  font-size: 11pt;
  line-height: 1.45;
}

h1, h2, h3, h4 { color: var(--ink); margin: 0; }

h2 {
  font-size: 12.5pt;
  margin-top: 18px;
  margin-bottom: 8px;
}

h3 {
  font-size: 11.5pt;
  margin-top: 14px;
  margin-bottom: 6px;
}

p { margin: 8px 0; }
ul { margin: 8px 0 8px 18px; }
li { margin: 4px 0; }

.callout {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 12px 0;
}

.callout--warn {
  background: var(--bg-warn);
  border-color: var(--border-warn);
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 10px 0 4px;
}

.meta-item { font-size: 10.5pt; }
.meta-item strong { font-weight: 700; }

.ncs-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 10.5pt;
}

.ncs-table th,
.ncs-table td {
  border: 1px solid var(--line);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}

.ncs-table th {
  background: var(--bg-soft);
  font-weight: 700;
}

.ncs-table tbody tr:nth-child(even) td {
  background: #FCFCFD;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9.5pt;
  border: 1px solid var(--line);
  background: #fff;
}

.badge--warn {
  background: var(--bg-warn);
  border-color: var(--border-warn);
}

.doc-footer {
  border-top: 1px solid var(--line);
  margin-top: 18px;
  padding-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 9.5pt;
  color: var(--muted);
}

.keep-together {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ================================ PRINT ================================== */

@page {
  size: A4;
  margin: 16mm 14mm 18mm;
}

@media print {
  html, body { background: transparent !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .ncs-doc {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .doc-header,
  .doc-footer {
    position: fixed;
    left: 0;
    right: 0;
    margin: 0;
    border-color: var(--line);
    background: #fff;
  }

  .doc-header {
    top: 0;
    padding: 6mm 14mm 3mm;
    height: 18mm;
    box-sizing: border-box;
  }

  .doc-footer {
    bottom: 0;
    padding: 3mm 14mm 3mm;
    height: 14mm;
    box-sizing: border-box;
  }

  .doc-body {
    padding-top: 22mm;
    padding-bottom: 18mm;
  }

  a { color: inherit; text-decoration: none; }

  h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }

  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .ncs-table { font-size: 10pt; }

  .screen-only { display: none !important; }
}
`.trim();

/** @returns {string} */
function getDocumentStylesCSS() {
  return DOCUMENT_STYLES_CSS;
}

/* ==========================================================================
  Utils (strings, dates, escaping, formatting)
============================================================================ */

/** @param {any} v @returns {string} */
// safeStr is now imported from './shared/ui.js'

/**
 * Escape básico para HTML (texto/atributos).
 * Substitui &, <, >, " e ' pelos equivalentes HTML.
 *
 * @param {any} value
 * @returns {string}
 */
// escapeHtml is now imported from './shared/ui.js'

/**
 * Sanitiza URL para uso em href (evita "javascript:" etc).
 * Aceita http(s) e paths relativos iniciando com "/" (opcionalmente "#").
 *
 * @param {any} url
 * @returns {string}
 */
function safeUrl(url) {
  const s = safeStr(url);
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
  if (s.startsWith('/') || s.startsWith('#')) return s;
  return '';
}

/** @param {any} date @returns {string} */
function formatDateBR(date) {
  try {
    return new Date(date || Date.now()).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

/** @param {any} date @returns {string} */
function formatDateTimeBR(date) {
  try {
    return new Date(date || Date.now()).toLocaleString('pt-BR');
  } catch {
    return '';
  }
}

/** @param {number} n @returns {string} */
function formatPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}

/** @param {any} bytes @returns {string} */
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = n;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const fixed = idx === 0 ? String(Math.round(val)) : val.toFixed(val >= 10 ? 1 : 2);
  return `${fixed} ${units[idx]}`;
}

/**
 * JSON stringify seguro com corte (evita “blob” gigante no relatório).
 *
 * @param {any} value
 * @param {number} [maxLen=1200]
 * @returns {string}
 */
function safeJsonStringify(value, maxLen = 1200) {
  try {
    const s = value == null ? '' : JSON.stringify(value);
    if (!s) return '';
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return safeStr(value);
  }
}

/* ==========================================================================
  KPI “lite” (para snapshot) — alinhado ao modelo atual
============================================================================ */

/**
 * Normaliza status do indicador (compatível com o conjunto atual).
 * @param {any} value
 * @returns {'Validado'|'Condicionante'|'Negado'|'Pendente'|'Não se aplica'}
 */
function normalizeStatusLite(value) {
  const s0 = safeStr(value);
  if (!s0) return 'Pendente';

  const low = s0
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (low === 'nao se aplica' || low === 'naoseaplica') return 'Não se aplica';
  if (low === 'pendente') return 'Pendente';
  if (low === 'validado') return 'Validado';
  if (low === 'negado') return 'Negado';
  if (low === 'condicionante') return 'Condicionante';

  return 'Pendente';
}

/** @returns {{Validado:1,Condicionante:0.5,Negado:0,Pendente:0,'Não se aplica':null}} */
function getStatusValueMap() {
  return {
    Validado: 1,
    Condicionante: 0.5,
    Negado: 0,
    Pendente: 0,
    'Não se aplica': null,
  };
}

/**
 * Score final (0–100) baseado na regra 50/50 (principal + revisor).
 * - NA em qualquer lado => null
 * - Pendente em qualquer lado => null
 *
 * @param {any} ind
 * @returns {number|null}
 */
function computeIndicatorFinalScoreLite(ind) {
  const map = getStatusValueMap();
  const sp = normalizeStatusLite(ind?.statusPrincipal ?? ind?.status ?? 'Pendente');
  const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

  if (sp === 'Não se aplica' || sr === 'Não se aplica') return null;
  if (sp === 'Pendente' || sr === 'Pendente') return null;

  const a = Object.prototype.hasOwnProperty.call(map, sp) ? map[sp] : 0;
  const b = Object.prototype.hasOwnProperty.call(map, sr) ? map[sr] : 0;
  if (a == null || b == null) return null;

  return Math.round(((a + b) / 2) * 100);
}

/**
 * Classificação final para relatório.
 * @param {number|null} score
 * @param {any} ind
 * @returns {'Validado'|'Condicionante'|'Negado'|'Pendente'|'NA'}
 */
function classifyFinalStatusLite(score, ind) {
  const sp = normalizeStatusLite(ind?.statusPrincipal ?? ind?.status ?? 'Pendente');
  const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

  if (sp === 'Não se aplica' || sr === 'Não se aplica') return 'NA';
  if (score == null) return 'Pendente';
  if (score === 100) return 'Validado';
  if (score === 0) return 'Negado';
  return 'Condicionante';
}

/**
 * KPI “lite” para operar em snapshot (sem depender de nenhuma função `computeKPIs()` de store).
 * Mantém campos-chave usados no relatório e no sumário executivo.
 *
 * @param {any[]} indicators
 * @returns {KPIReport}
 */
function computeKPIsLite(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  const pillars = ['E', 'S', 'G'];

  const statusCounts = { Validado: 0, Condicionante: 0, Negado: 0, Pendente: 0, NA: 0 };

  const pillarSumCons = { E: 0, S: 0, G: 0 };
  const pillarCntCons = { E: 0, S: 0, G: 0 };

  const pSum = { E: 0, S: 0, G: 0 };
  const pCnt = { E: 0, S: 0, G: 0 };
  const rSum = { E: 0, S: 0, G: 0 };
  const rCnt = { E: 0, S: 0, G: 0 };

  /** @type {Record<string, {finalScore:(number|null), finalClass:string, pillar:(string|null)}>} */
  const indicatorScores = {};

  let hasCriticalConflict = false;

  list.forEach((ind) => {
    const id = safeStr(ind?.id);
    if (!id) return;

    const pillar = pillars.includes(String(ind?.pillar || '').toUpperCase())
      ? String(ind.pillar).toUpperCase()
      : null;

    const sp = normalizeStatusLite(ind?.statusPrincipal ?? ind?.status ?? 'Pendente');
    const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

    const finalScore = computeIndicatorFinalScoreLite(ind);
    const finalClass = classifyFinalStatusLite(finalScore, ind);

    indicatorScores[id] = { finalScore, finalClass, pillar };

    if (statusCounts[finalClass] != null) statusCounts[finalClass] += 1;

    if (pillar) {
      // conservador: NA não entra; pendente vira 0
      const isNA = sp === 'Não se aplica' || sr === 'Não se aplica';
      if (!isNA) {
        pillarCntCons[pillar] += 1;
        pillarSumCons[pillar] += finalScore == null ? 0 : finalScore;
      }

      // score por role (apenas decididos daquele role)
      const map = getStatusValueMap();
      const vp = Object.prototype.hasOwnProperty.call(map, sp) ? map[sp] : 0;
      const vr = Object.prototype.hasOwnProperty.call(map, sr) ? map[sr] : 0;

      if (sp !== 'Não se aplica' && sp !== 'Pendente' && vp != null) {
        pSum[pillar] += vp * 100;
        pCnt[pillar] += 1;
      }
      if (sr !== 'Não se aplica' && sr !== 'Pendente' && vr != null) {
        rSum[pillar] += vr * 100;
        rCnt[pillar] += 1;
      }
    }

    // trava crítica: conflito direto em indicadores críticos (id numérico)
    const idNum = Number(ind?.id);
    if (Number.isFinite(idNum) && Array.isArray(CRITICAL_INDICATOR_IDS) && CRITICAL_INDICATOR_IDS.includes(idNum)) {
      const conflict = (sp === 'Validado' && sr === 'Negado') || (sp === 'Negado' && sr === 'Validado');
      if (conflict) hasCriticalConflict = true;
    }
  });

  const scorePorPilar = { E: 0, S: 0, G: 0 };
  pillars.forEach((p) => {
    scorePorPilar[p] = pillarCntCons[p] > 0 ? Math.round(pillarSumCons[p] / pillarCntCons[p]) : 0;
  });

  const scoreTotal = Math.round((scorePorPilar.E + scorePorPilar.S + scorePorPilar.G) / 3);

  const roleScore = (sumMap, countMap) => {
    let sum = 0;
    let cnt = 0;
    pillars.forEach((p) => {
      const avg = countMap[p] > 0 ? sumMap[p] / countMap[p] : 0;
      sum += avg;
      cnt += 1;
    });
    return cnt > 0 ? sum / cnt : 0;
  };

  const principalScore = roleScore(pSum, pCnt);
  const revisorScore = roleScore(rSum, rCnt);

  const disparity =
    Math.abs(principalScore - revisorScore) > Number(DISPARITY_THRESHOLD_PP || 0) || hasCriticalConflict;

  /** @type {Record<string, boolean>} */
  const requiresConsensusById = {};
  if (disparity) {
    Object.keys(indicatorScores).forEach((id) => {
      const src = list.find((x) => safeStr(x?.id) === id) || {};
      const sp = normalizeStatusLite(src?.statusPrincipal ?? src?.status ?? 'Pendente');
      const sr = normalizeStatusLite(src?.statusRevisor ?? 'Pendente');
      requiresConsensusById[id] = sp !== sr;
    });
  } else {
    Object.keys(indicatorScores).forEach((id) => {
      requiresConsensusById[id] = false;
    });
  }

  return {
    pendentes: statusCounts.Pendente,
    conformes: statusCounts.Validado,
    pontos: scoreTotal,

    scoreTotal,
    scorePorPilar,
    statusCounts,
    disparity,
    hasCriticalConflict,
    indicatorScores,
    requiresConsensusById,
  };
}

/* ==========================================================================
  Builders (tabelas / seções)
============================================================================ */

/** @param {any} status @returns {string} */
function renderStatusBadge(status) {
  const s = normalizeStatusLite(status);
  const warn = s === 'Condicionante' || s === 'Negado' || s === 'Pendente';
  const cls = warn ? 'badge badge--warn' : 'badge';
  return `<span class="${cls}">${escapeHtml(s)}</span>`;
}

/**
 * Monta tabela de indicadores (principal/revisor/final + score).
 *
 * @param {any[]} indicators
 * @param {KPIReport|null} kpis
 * @returns {string}
 */
function buildIndicatorsTable(indicators, kpis) {
  const list = Array.isArray(indicators) ? indicators : [];

  const rows = list
    .map((ind) => {
      const id = safeStr(ind?.id);
      if (!id) return '';

      const name = safeStr(ind?.title || ind?.name || ind?.code || `Indicador ${id}`) || `Indicador ${id}`;
      const pillar = safeStr(ind?.pillar || '') || '—';

      const sp = normalizeStatusLite(ind?.statusPrincipal ?? ind?.status ?? 'Pendente');
      const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

      const explicitFinal = safeStr(ind?.statusFinal);
      const finalStatus =
        explicitFinal ? normalizeStatusLite(explicitFinal) : sp === sr ? sp : 'Pendente';

      const score = kpis?.indicatorScores?.[id]?.finalScore;
      const scoreCell = score == null ? '—' : `${escapeHtml(String(score))}%`;

      const needsConsensus = !!kpis?.requiresConsensusById?.[id];
      const consensusMark = needsConsensus ? ' <span class="badge badge--warn">consenso</span>' : '';

      return `
<tr>
  <td>${escapeHtml(id)}</td>
  <td>${escapeHtml(name)}${consensusMark}</td>
  <td>${escapeHtml(pillar)}</td>
  <td>${renderStatusBadge(sp)}</td>
  <td>${renderStatusBadge(sr)}</td>
  <td>${renderStatusBadge(finalStatus)}</td>
  <td>${scoreCell}</td>
</tr>`.trim();
    })
    .filter(Boolean)
    .join('\n');

  return `
<table class="ncs-table">
  <thead>
    <tr>
      <th style="width:72px;">ID</th>
      <th>Indicador</th>
      <th style="width:56px;">Pilar</th>
      <th style="width:120px;">Principal</th>
      <th style="width:120px;">Revisor</th>
      <th style="width:120px;">Final</th>
      <th style="width:90px;">Score</th>
    </tr>
  </thead>
  <tbody>
    ${rows || ''}
  </tbody>
</table>`.trim();
}

/**
 * Monta tabela de evidências (metadados).
 *
 * @param {any[]} evidences
 * @returns {string}
 */
function buildEvidencesTable(evidences) {
  const list = Array.isArray(evidences) ? evidences : [];

  const rows = list
    .map((ev) => {
      const id = safeStr(ev?.id || ev?.evidenceId);
      if (!id) return '';

      const name = safeStr(ev?.name || ev?.fileName || ev?.filename || 'arquivo') || 'arquivo';
      const pillar = safeStr(ev?.pillar || ev?.esg || ev?.axis || '—') || '—';
      const size = formatBytes(ev?.size || ev?.bytes || 0);
      const date = ev?.date || ev?.createdAt || ev?.timestamp || ev?.ts || null;
      const dateBR = date ? formatDateBR(date) : '';
      const indId = safeStr(ev?.indicatorId ?? ev?.indicator ?? ev?.indId ?? '') || '';

      return `
<tr>
  <td>${escapeHtml(id)}</td>
  <td>${escapeHtml(name)}</td>
  <td>${escapeHtml(pillar)}</td>
  <td>${escapeHtml(size || '')}</td>
  <td>${escapeHtml(dateBR || '')}</td>
  <td>${escapeHtml(indId || '')}</td>
</tr>`.trim();
    })
    .filter(Boolean)
    .join('\n');

  return `
<table class="ncs-table">
  <thead>
    <tr>
      <th style="width:160px;">ID</th>
      <th>Arquivo</th>
      <th style="width:70px;">Pilar</th>
      <th style="width:110px;">Tamanho</th>
      <th style="width:110px;">Data</th>
      <th style="width:90px;">Indicador</th>
    </tr>
  </thead>
  <tbody>
    ${rows || ''}
  </tbody>
</table>`.trim();
}

/**
 * Monta tabela do audit log.
 * Suporta o formato canônico do backend (id+occurred_at+event_type+meta+actor_user_id)
 * e o formato interno de logs em memória (id+ts+event+payload). Outros formatos não são suportados.
 *
 * @param {any[]} auditLog
 * @returns {string}
 */
function buildAuditTable(auditLog) {
  const list = Array.isArray(auditLog) ? auditLog : [];

  const rows = list
    .map((entry) => {
      // Normalize audit entry fields.  The canonical API uses `id`,
      // `occurred_at`, `event_type`, `meta` and `actor_user_id`.  Local
      // in‑memory logs (src/audit.js) use `id`, `ts`, `event` and `payload`.
      // We intentionally avoid older aliases such as `createdAt`, `timestamp`,
      // `user`, `by`, `action` or `type`, which have been removed from the
      // backend contract.  See docs/API.md for details.
      const id = safeStr(entry?.id);
      if (!id) return '';

      const date = entry?.occurred_at || entry?.ts || null;
      const when = date ? formatDateTimeBR(date) : '';

      const actor = safeStr(entry?.actor || entry?.actor_user_id || 'system') || 'system';
      const action = safeStr(entry?.event_type || entry?.event || 'log') || 'log';

      const message = safeStr(entry?.message || '');
      const details = safeJsonStringify(entry?.meta ?? entry?.payload ?? null);

      // Mostra message + details (sem “blob gigante”)
      const combined = [message, details].filter(Boolean).join(' • ');

      return `
<tr>
  <td>${escapeHtml(id)}</td>
  <td>${escapeHtml(when)}</td>
  <td>${escapeHtml(actor)}</td>
  <td>${escapeHtml(action)}</td>
  <td>${escapeHtml(combined)}</td>
</tr>`.trim();
    })
    .filter(Boolean)
    .join('\n');

  return `
<table class="ncs-table">
  <thead>
    <tr>
      <th style="width:160px;">ID</th>
      <th style="width:150px;">Data/Hora</th>
      <th style="width:150px;">Ator</th>
      <th style="width:160px;">Ação</th>
      <th>Detalhes</th>
    </tr>
  </thead>
  <tbody>
    ${rows || ''}
  </tbody>
</table>`.trim();
}

/* ==========================================================================
  Public API
============================================================================ */

/**
 * Gera um documento HTML completo (self-contained) com:
 * - Cabeçalho (organização, processo, data)
 * - KPIs (pontuação total e por pilar + statusCounts)
 * - Tabela de indicadores (principal/revisor/final + score)
 * - Tabela de evidências (metadados)
 * - Tabela de audit log
 *
 * Quando `snapshot` é fornecido, o relatório usa esse estado e calcula KPIs via
 * `computeKPIsLite()` (não depende de nenhuma função `computeKPIs()` nem altera o estado global).
 *
 * @param {ReportSnapshot|null} [snapshot=null] Snapshot opcional do estado.
 * @returns {string} Documento HTML completo.
 */
export function generateReportHTML(snapshot = null) {
  // Quando um snapshot é fornecido ele é a única fonte de dados para o relatório.
  // Quando não houver snapshot, operamos com um estado vazio – o relatório
  // permanece autossuficiente mas pode exibir poucos dados.  Não carregamos
  // nem lemos de nenhuma store do front‑end; a fonte de verdade é sempre o backend e quaisquer
  // snapshots explicitamente fornecidos.

  /** @type {ReportSnapshot} */
  const coreState = snapshot || {};
  const indicators = Array.isArray(coreState.indicators) ? coreState.indicators : [];
  const evidences = Array.isArray(coreState.evidences) ? coreState.evidences : [];
  const auditLog = Array.isArray(coreState.auditLog) ? coreState.auditLog : [];

  const sess = (sessionState && sessionState.session) || {};
  const company = safeStr(sess.company) || safeStr(coreState?.processes?.[0]?.company) || 'Organização';

  const proc = Array.isArray(coreState.processes) && coreState.processes.length > 0 ? coreState.processes[0] : null;
  const processId = safeStr(proc?.id || proc?.processId || proc?.publicId || proc?.slug) || '—';

  const emittedAt = formatDateBR();
  const emittedAtIso = (() => {
    try {
      return new Date().toISOString();
    } catch {
      return '';
    }
  })();

  // KPIs: sempre computa no modo “lite” usando apenas os indicadores do
  // snapshot/estado.  Não invoca nenhuma função `computeKPIs()` de store, pois a store
  // da UI não é a fonte de verdade para relatórios.
  /** @type {KPIReport|null} */
  const kpis = computeKPIsLite(indicators);

  const disparity = !!kpis?.disparity;
  const pendingConsensusIds = disparity
    ? Object.keys(kpis?.requiresConsensusById || {}).filter((id) => kpis.requiresConsensusById[id])
    : [];

  const consensusResolved = disparity
    ? pendingConsensusIds.every((id) => {
        const ind = indicators.find((x) => safeStr(x?.id) === String(id));
        const sf = safeStr(ind?.statusFinal);
        // Resolvido quando existe e não é “pendente”
        return !!sf && normalizeStatusLite(sf) !== 'Pendente';
      })
    : true;

  const disparityMessage = !disparity
    ? 'Nenhuma disparidade detectada.'
    : consensusResolved
      ? 'Trava de disparidade aplicada: consenso registrado.'
      : 'Trava de disparidade aplicada: pendente de consenso.';

  const kpiCallout =
    disparity && !consensusResolved
      ? `<div class="callout callout--warn"><strong>Atenção:</strong> há divergências que exigem consenso final em alguns indicadores.</div>`
      : '';

  const indicatorsTable = buildIndicatorsTable(indicators, kpis);
  const evidencesTable = buildEvidencesTable(evidences);
  const auditTable = buildAuditTable(auditLog);

  const statusCounts = kpis?.statusCounts || { Validado: 0, Condicionante: 0, Negado: 0, Pendente: 0, NA: 0 };
  const scorePorPilar = kpis?.scorePorPilar || { E: 0, S: 0, G: 0 };

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relatório NCS</title>
    <style>
${getDocumentStylesCSS()}
    </style>
  </head>
  <body>
    <div class="ncs-doc">
      <header class="doc-header">
        <div>
          <div class="doc-brand">NCS — Governança &amp; Impacto</div>
          <div class="doc-title">Relatório do Processo</div>
        </div>
        <div class="doc-meta">
          <div><strong>Processo:</strong> ${escapeHtml(processId)}</div>
          <div><strong>Emissão:</strong> ${escapeHtml(emittedAt)}</div>
        </div>
      </header>

      <main class="doc-body">
        <div class="meta-grid keep-together">
          <div class="meta-item"><strong>Organização:</strong> ${escapeHtml(company)}</div>
          <div class="meta-item"><strong>Observação:</strong> ${escapeHtml(disparityMessage)}</div>

          <div class="meta-item"><strong>Pontuação total:</strong> ${formatPercent(kpis?.scoreTotal)}</div>
          <div class="meta-item">
            <strong>Status finais:</strong>
            Validados ${escapeHtml(String(statusCounts.Validado ?? 0))},
            Condicionantes ${escapeHtml(String(statusCounts.Condicionante ?? 0))},
            Negados ${escapeHtml(String(statusCounts.Negado ?? 0))},
            Pendentes ${escapeHtml(String(statusCounts.Pendente ?? 0))},
            N/A ${escapeHtml(String(statusCounts.NA ?? 0))}
          </div>

          <div class="meta-item"><strong>Pilar E:</strong> ${formatPercent(scorePorPilar.E)}</div>
          <div class="meta-item">
            <strong>Pilar S:</strong> ${formatPercent(scorePorPilar.S)}
            <span style="color:var(--muted)">•</span>
            <strong>Pilar G:</strong> ${formatPercent(scorePorPilar.G)}
          </div>
        </div>

        ${kpiCallout}

        <section>
          <h2>Indicadores</h2>
          ${indicatorsTable}
        </section>

        <section>
          <h2>Evidências</h2>
          ${evidencesTable}
        </section>

        <section>
          <h2>Log de auditoria</h2>
          ${auditTable}
        </section>

        <section class="screen-only">
          <h3>Notas</h3>
          <p style="color: var(--muted); font-size: 10pt;">
            Documento autônomo gerado em <strong>${escapeHtml(emittedAtIso)}</strong>.
            Use a impressão do navegador para exportar em PDF.
          </p>
        </section>
      </main>

      <footer class="doc-footer">
        <div>Documento gerado pelo protótipo (uso interno).</div>
        <div>Processo: ${escapeHtml(processId)}</div>
      </footer>
    </div>
  </body>
</html>`;
}

/**
 * Dispara o download de um HTML (quando em browser).
 *
 * @param {string} filename Nome do arquivo (idealmente termina com .html)
 * @param {string} htmlString Conteúdo HTML
 * @returns {boolean} true se tentou iniciar download; false se ambiente não suportado.
 */
export function downloadReportHTML(filename, htmlString) {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;

    const finalName = safeStr(filename) || `relatorio_ncs_${new Date().toISOString().slice(0, 10)}.html`;
    const blob = new Blob([String(htmlString || '')], { type: 'text/html;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    a.rel = 'noopener';
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // noop
      }
      try {
        a.remove();
      } catch {
        // noop
      }
    }, 0);

    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[report] downloadReportHTML failed:', err);
    return false;
  }
}

/**
 * Gera um “Sumário Executivo” (HTML parcial) para o dashboard.
 * - Não é documento completo; deve ser inserido em um container do DOM.
 * - Usa snapshot quando fornecido; caso contrário usa um estado vazio juntamente com a sessão.
 *
 * Inclui:
 * - Identificação (organização/cnpj/cidade/setor)
 * - Ciclo (ano), nível e status
 * - KPIs (total + por pilar + contagem de status)
 * - Top forças e gaps (a partir de scores)
 * - Trava de disparidade (quando aplicável)
 * - Link público (quando houver)
 *
 * @param {ReportSnapshot|null} [snapshot=null]
 * @returns {string}
 */
export function generateExecutiveSummaryHTML(snapshot = null) {
  // Para o sumário executivo, quando um snapshot é fornecido ele é usado como
  // fonte única.  Caso contrário, utiliza‑se um estado vazio, pois não lemos
  // de nenhuma store da UI.  Qualquer informação adicional (por exemplo, empresa,
  // cnpj) deve vir da sessão (state.js).

  /** @type {ReportSnapshot} */
  const coreState = snapshot || {};

  const sess = (sessionState && sessionState.session) || {};
  const proc = Array.isArray(coreState.processes) && coreState.processes.length > 0 ? coreState.processes[0] : null;

  const company = safeStr(sess.company) || safeStr(proc?.company) || '—';
  const cnpj = safeStr(sess.cnpj || proc?.cnpj) || '—';
  const city = safeStr(sess.city || proc?.city) || '—';
  const sector = safeStr(sess.sector || proc?.sector) || '—';

  const level = safeStr(proc?.level || proc?.nivel) || '—';
  const status = safeStr(proc?.status) || '—';

  let cycleYear = '—';
  try {
    const dateSrc = proc?.cycleYear || proc?.dueAt || proc?.submittedAt || proc?.updatedAt || null;
    if (dateSrc) {
      const d = new Date(dateSrc);
      if (!Number.isNaN(d.getTime())) cycleYear = String(d.getFullYear());
    }
  } catch {
    cycleYear = '—';
  }

  const indicators = Array.isArray(coreState.indicators) ? coreState.indicators : [];

  /** @type {KPIReport|null} */
  const kpis = computeKPIsLite(indicators);

  const scoreTotal = formatPercent(kpis?.scoreTotal);
  const scoreE = formatPercent(kpis?.scorePorPilar?.E);
  const scoreS = formatPercent(kpis?.scorePorPilar?.S);
  const scoreG = formatPercent(kpis?.scorePorPilar?.G);

  const counts = kpis?.statusCounts || { Validado: 0, Condicionante: 0, Negado: 0, Pendente: 0, NA: 0 };

  // Helpers para nome do indicador
  /** @param {string} id @returns {string} */
  function getIndName(id) {
    const numId = Number(id);
    const found = indicators.find((ind) => Number(ind?.id) === numId) || indicators.find((ind) => safeStr(ind?.id) === id);
    return safeStr(found?.title || found?.name) || `Indicador ${id}`;
  }

  const indicatorScores = kpis?.indicatorScores || {};
  const strengths = Object.entries(indicatorScores)
    .filter(([, val]) => val && val.finalClass === 'Validado')
    .map(([id, val]) => ({ id, name: getIndName(id), score: Number(val.finalScore ?? 0) || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const gapsList = Object.entries(indicatorScores)
    .filter(([, val]) => val && (val.finalClass === 'Negado' || val.finalClass === 'Condicionante'))
    .map(([id, val]) => ({ id, name: getIndName(id), score: Number(val.finalScore ?? 0) || 0 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const strengthsHtml =
    strengths.length > 0 ? strengths.map((s) => `<li>${escapeHtml(s.name)} (${escapeHtml(String(s.score))}%)</li>`).join('') : '<li>—</li>';

  const gapsHtml =
    gapsList.length > 0 ? gapsList.map((g) => `<li>${escapeHtml(g.name)} (${escapeHtml(String(g.score))}%)</li>`).join('') : '<li>—</li>';

  let disparityBlock = '';
  if (kpis?.disparity) {
    const requires = kpis.requiresConsensusById || {};
    const pending = Object.keys(requires)
      .filter((id) => requires[id])
      .map((id) => getIndName(id));

    const listHtml = pending.length > 0 ? pending.map((n) => `<li>${escapeHtml(n)}</li>`).join('') : '<li>—</li>';

    disparityBlock = `
<div class="disparity-block">
  <h4>Trava de disparidade</h4>
  <p>Identificada divergência entre avaliador principal e revisor. Indicadores que exigem consenso:</p>
  <ul>${listHtml}</ul>
</div>`.trim();
  }

  // Link público: usa proc.publicLink quando existir (sanitizado)
  let publicLink = safeUrl(proc?.publicLink);
  if (!publicLink && proc?.id) {
    // fallback conservador: não inventar domínio; apenas path relativo “possível”
    publicLink = safeUrl(`/verify/${encodeURIComponent(String(proc.id))}`);
  }

  const linkHtml = publicLink
    ? `<p><strong>Link verificável:</strong> <a href="${escapeHtml(publicLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(publicLink)}</a></p>`
    : '';

  const disclaimerText =
    'Natureza e limitação do reconhecimento: O Selo NCS: Governança & Impacto é um reconhecimento anual obtido mediante verificação independente e documental. Não constitui certificação regulatória, auditoria fiscal ou garantia de qualidade de produtos e serviços. A avaliação refere-se apenas às práticas de governança e impacto socioambiental da organização no período analisado, com validade de 12 meses. A licença de uso do selo é pessoal e intransferível, vinculada ao CNPJ avaliado e cessa automaticamente ao término da validade. É vedado utilizar o selo como endosso a produtos ou a terceiros e é proibido alterar ou manipular a arte do selo.';

  return `<div class="executive-summary">
  <h3>Sumário Executivo</h3>

  <p><strong>Organização:</strong> ${escapeHtml(company)}</p>
  <p><strong>CNPJ:</strong> ${escapeHtml(cnpj)}</p>
  <p><strong>Localização e setor:</strong> ${escapeHtml(city)} • ${escapeHtml(sector)}</p>
  <p><strong>Ciclo:</strong> ${escapeHtml(cycleYear)} • <strong>Nível:</strong> ${escapeHtml(level)} • <strong>Status:</strong> ${escapeHtml(status)}</p>

  <h4>Resultado</h4>
  <p><strong>Pontuação total:</strong> ${escapeHtml(scoreTotal)}</p>
  <p><strong>Pontuação por pilar:</strong> E = ${escapeHtml(scoreE)}, S = ${escapeHtml(scoreS)}, G = ${escapeHtml(scoreG)}</p>
  <p><strong>Contagem por status:</strong>
    Validado ${escapeHtml(String(counts.Validado ?? 0))},
    Condicionante ${escapeHtml(String(counts.Condicionante ?? 0))},
    Negado ${escapeHtml(String(counts.Negado ?? 0))},
    Pendentes ${escapeHtml(String(counts.Pendente ?? 0))},
    N/A ${escapeHtml(String(counts.NA ?? 0))}
  </p>

  <h4>Top 3 forças</h4>
  <ul>${strengthsHtml}</ul>

  <h4>Top 3 gaps</h4>
  <ul>${gapsHtml}</ul>

  ${disparityBlock}
  ${linkHtml}

  <p class="disclaimer" style="font-size:0.75rem; margin-top:1rem;">
    <em>${escapeHtml(disclaimerText)}</em>
  </p>
</div>`;
}
