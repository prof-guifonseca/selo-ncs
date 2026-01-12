/**
 * @fileoverview
 * Deliverables helpers (NCS prototype)
 *
 * Este módulo gera entregáveis adicionais (além do relatório padrão),
 * mantendo o mesmo “contrato” do protótipo: HTML autossuficiente, resiliente
 * a dados incompletos e com tipagem leve via JSDoc.
 *
 * Exporta:
 * - generateActionPlanHTML(params?): fragmento HTML “Plano de Ação” (para embed).
 * - generateTechnicalOpinionHTML(snapshot?): documento HTML completo (“Parecer Técnico”).
 * - generateSealCertificateHTML(params?): documento HTML completo (“Certificado / Selo”).
 *
 * Diretrizes de higiene:
 * - Nunca assumir shape perfeito (legacy/compat).
 * - Escape de HTML em todos os valores interpolados.
 * - Fallbacks conservadores (não inventar domínio/URL externa).
 * - KPI: usa computeKPIs() quando possível; caso contrário, computa um KPI “lite”
 *   a partir da lista de indicadores (útil para snapshots e “modo documento”).
 */

// sessionState is still used for metadata (company/cnpj) only.  It does
// not contain indicator data.
import { state as sessionState } from './state.js';
// Import shared helpers (safeStr, escapeHtml) from central module. These were
// previously defined locally in this file.
import { safeStr, escapeHtml } from './shared/ui.js';

/*
 * -----------------------------------------------------------------------------
 * Backend parity constants
 *
 * The deliverables module references two global constants —
 * `CRITICAL_INDICATOR_IDS` and `DISPARITY_THRESHOLD_PP` — when computing
 * disparities and summarising KPIs.  These symbols are defined on the
 * backend (see `netlify/functions/api/domain.js`) but are not exported for
 * consumption by the client.  Without definitions in this file the code
 * would throw ReferenceError at runtime.  To ensure the module remains
 * self‑contained we explicitly define the constants here using the same
 * values as the backend.  Should the business rules change these values
 * should be updated in both places.
 */
/** @type {number[]} */
const CRITICAL_INDICATOR_IDS = [10, 11];
/** @type {number} */
const DISPARITY_THRESHOLD_PP = 20;

/* ==========================================================================
  Tipagem leve (JSDoc)
============================================================================ */

/**
 * @typedef {'Validado'|'Condicionante'|'Negado'|'Pendente'|'Não se aplica'} IndicatorStatus
 */

/**
 * @typedef {Object} Indicator
 * @property {string|number} id
 * @property {string=} title
 * @property {string=} name
 * @property {string=} code
 * @property {'E'|'S'|'G'|string=} pillar
 * @property {IndicatorStatus|string=} statusPrincipal
 * @property {IndicatorStatus|string=} statusRevisor
 * @property {IndicatorStatus|string=} statusFinal
 */

/**
 * @typedef {Object} Process
 * @property {string=} id
 * @property {string=} processId
 * @property {string=} company
 * @property {string=} cnpj
 * @property {string=} city
 * @property {string=} sector
 * @property {string|number=} cycleYear
 * @property {string=} dueAt
 * @property {string=} submittedAt
 * @property {string=} updatedAt
 * @property {string=} publicLink
 */

/**
 * @typedef {Object} KPIIndicatorScore
 * @property {number|null=} finalScore
 * @property {string=} finalClass
 * @property {string|null=} pillar
 */

/**
 * @typedef {Object} KPIs
 * @property {number=} scoreTotal
 * @property {{E?:number,S?:number,G?:number}=} scorePorPilar
 * @property {{Validado?:number,Condicionante?:number,Negado?:number,Pendente?:number,NA?:number}=} statusCounts
 * @property {Record<string, KPIIndicatorScore>=} indicatorScores
 * @property {boolean=} disparity
 * @property {Record<string, boolean>=} requiresConsensusById
 */

/**
 * @typedef {Object} ReportSnapshot
 * @property {Indicator[]=} indicators
 * @property {Process[]=} processes
 * @property {Record<string, any>=} _meta
 */

/* ==========================================================================
  Constantes (fallbacks seguros)
============================================================================ */

const DISPARITY_THRESHOLD = Number.isFinite(Number(DISPARITY_THRESHOLD_PP))
  ? Number(DISPARITY_THRESHOLD_PP)
  : 20;

const CRITICAL_IDS = Array.isArray(CRITICAL_INDICATOR_IDS) ? CRITICAL_INDICATOR_IDS : [];

/* ==========================================================================
  Utils (strings, dates, escaping, urls)
============================================================================ */

/** @param {any} v @returns {string} */
// safeStr is now imported from './shared/ui.js'

/**
 * Escape básico para HTML (texto/atributos).
 * @param {any} value
 * @returns {string}
 */
// escapeHtml is now imported from './shared/ui.js'

/**
 * Sanitiza URL para uso em href.
 * Aceita apenas http(s) e paths relativos iniciando com "/" ou "#".
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

/** @param {any} value @returns {string} */
function formatDateBR(value = null) {
  try {
    const d = value ? new Date(value) : new Date();
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
  } catch {
    // ignore
  }
  return '—';
}

/**
 * Retorna uma data (ISO) somando dias ao “agora”.
 * @param {number} days
 * @returns {string} ISO string ou ''.
 */
function isoPlusDays(days) {
  try {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString();
  } catch {
    return '';
  }
}

/* ==========================================================================
  CSS (screen + print)
============================================================================ */

/**
 * CSS unificado (screen + print) para documentos “expedidos” via impressão do navegador.
 * Compatível com Chromium (Chrome/Edge). Evita “margin boxes” avançadas.
 *
 * Observação:
 * - Esta folha também define classes usadas por Parecer/Certificado, evitando
 *   divergências (ex.: .meta-key/.meta-val, .signature-block).
 */
function getDocumentStylesCSS() {
  return `
:root {
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  --text: #101828;
  --muted: #667085;
  --line: #e4e7ec;
  --bg-soft: #f9fafb;
  --bg-warn: #fff7e8;
  --warn-line: #ffe2b6;
  --radius: 10px;
}

html, body { padding: 0; margin: 0; }
body { font-family: var(--font); color: var(--text); background: #fff; }

.ncs-doc { max-width: 980px; margin: 0 auto; padding: 28px; }

.doc-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 18px;
}

.doc-brand {
  font-size: 10.5pt;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: uppercase;
}

.doc-title { font-size: 16pt; line-height: 1.15; font-weight: 750; margin-top: 2px; }

.doc-meta { text-align: right; font-size: 10pt; color: var(--muted); line-height: 1.25; }
.doc-meta-key { color: var(--muted); font-weight: 650; margin-right: 6px; }

.doc-body { font-size: 11pt; line-height: 1.45; }

h1, h2, h3, h4 { margin: 0; font-weight: 750; letter-spacing: 0.01em; }
h1 { font-size: 15pt; margin: 0 0 10px; }
h2 { font-size: 13pt; margin-top: 16px; margin-bottom: 8px; }
h3 { font-size: 12.25pt; margin-top: 14px; margin-bottom: 6px; }
h4 { font-size: 11.5pt; margin-top: 12px; margin-bottom: 6px; }

p { margin: 8px 0; }
ul { margin: 8px 0 8px 18px; padding: 0; }
li { margin: 4px 0; }

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin: 0 0 14px 0;
}

.meta-item { font-size: 10.5pt; }
.meta-key { display: inline-block; min-width: 92px; color: var(--muted); font-weight: 650; }
.meta-val { font-weight: 650; color: var(--text); }

.ncs-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  margin-top: 8px;
}

.ncs-table th,
.ncs-table td {
  border-bottom: 1px solid var(--line);
  padding: 7px 8px;
  text-align: left;
  vertical-align: top;
}

.ncs-table th {
  background: var(--bg-soft);
  font-size: 10pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.ncs-table tbody tr:nth-child(even) td { background: #fcfcfd; }

.callout {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: #fff;
  margin: 12px 0;
}

.callout--warning { background: var(--bg-warn); border-color: var(--warn-line); }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9.5pt;
  border: 1px solid var(--line);
  background: #fff;
}

.badge--warn { background: var(--bg-warn); border-color: var(--warn-line); }

.qr-placeholder {
  width: 120px;
  height: 120px;
  border: 1px dashed #98a2b3;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
  font-size: 9pt;
  color: #98a2b3;
}

.signature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 18px;
}

.signature-block {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.signature-line { height: 20px; border-bottom: 1px solid #98a2b3; margin-bottom: 6px; }
.signature-caption { font-size: 9.5pt; color: var(--muted); }
.signature-meta { font-size: 10pt; color: var(--text); font-weight: 650; }

.small { font-size: 10pt; color: var(--muted); }

.doc-footer {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 9.5pt;
  color: var(--muted);
}

.keep-together,
.no-break { break-inside: avoid; page-break-inside: avoid; }

@media print {
  @page { size: A4; margin: 16mm 14mm 18mm; }

  html, body { background: transparent; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .ncs-doc { max-width: none; margin: 0; padding: 0; }

  .doc-header,
  .doc-footer {
    position: fixed;
    left: 0;
    right: 0;
    padding-left: 14mm;
    padding-right: 14mm;
    background: #fff;
  }

  .doc-header {
    top: 0;
    height: 18mm;
    padding-top: 5mm;
    padding-bottom: 3mm;
    border-bottom: 0.2mm solid var(--line);
    margin: 0;
  }

  .doc-footer {
    bottom: 0;
    height: 14mm;
    padding-top: 3mm;
    border-top: 0.2mm solid var(--line);
    margin: 0;
  }

  .doc-body { padding-top: 22mm; padding-bottom: 18mm; }

  h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }

  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  tr,
  .action-item { break-inside: avoid; page-break-inside: avoid; }

  a { color: inherit; text-decoration: none; }
}
`.trim();
}

/* ==========================================================================
  KPI “lite” (para snapshot / listas externas)
============================================================================ */

/**
 * Normaliza status (tolerante a variações).
 * @param {any} value
 * @returns {IndicatorStatus}
 */
function normalizeStatusLite(value) {
  const s0 = safeStr(value);
  if (!s0) return 'Pendente';

  const low = s0
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (low === 'nao se aplica' || low === 'naoseaplica' || low === 'n/a' || low === 'na') return 'Não se aplica';
  if (low === 'pendente') return 'Pendente';
  if (low === 'validado') return 'Validado';
  if (low === 'negado') return 'Negado';
  if (low === 'condicionante') return 'Condicionante';

  return 'Pendente';
}

/** @returns {{Validado:1,Condicionante:0.5,Negado:0,Pendente:0,'Não se aplica':null}} */
function statusValueMap() {
  return { Validado: 1, Condicionante: 0.5, Negado: 0, Pendente: 0, 'Não se aplica': null };
}

/**
 * Score final (0–100) pela regra 50/50 (principal + revisor).
 * - Se qualquer lado for “Não se aplica” => null (NA).
 * - Se qualquer lado for “Pendente” => null (pendência).
 * @param {Indicator} ind
 * @returns {number|null}
 */
function computeFinalScoreLite(ind) {
  const map = statusValueMap();
  const sp = normalizeStatusLite(ind?.statusPrincipal ?? 'Pendente');
  const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

  if (sp === 'Não se aplica' || sr === 'Não se aplica') return null;
  if (sp === 'Pendente' || sr === 'Pendente') return null;

  const a = map[sp];
  const b = map[sr];
  if (a == null || b == null) return null;

  return Math.round(((a + b) / 2) * 100);
}

/**
 * Classificação final “document-friendly”.
 * @param {number|null} score
 * @param {Indicator} ind
 * @returns {'Validado'|'Condicionante'|'Negado'|'Pendente'|'NA'}
 */
function classifyFinalLite(score, ind) {
  const sp = normalizeStatusLite(ind?.statusPrincipal ?? 'Pendente');
  const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

  if (sp === 'Não se aplica' || sr === 'Não se aplica') return 'NA';
  if (score == null) return 'Pendente';
  if (score === 100) return 'Validado';
  if (score === 0) return 'Negado';
  return 'Condicionante';
}

/**
 * KPIs lite: suficiente para Plano/Parecer/Certificado quando KPIs “reais” não estão disponíveis.
 * @param {Indicator[]} indicators
 * @returns {KPIs}
 */
function computeKPIsLite(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  const pillars = ['E', 'S', 'G'];

  const statusCounts = { Validado: 0, Condicionante: 0, Negado: 0, Pendente: 0, NA: 0 };
  /** @type {Record<string, KPIIndicatorScore>} */
  const indicatorScores = {};

  const pillarSum = { E: 0, S: 0, G: 0 };
  const pillarCnt = { E: 0, S: 0, G: 0 };

  let hasCriticalConflict = false;

  list.forEach((ind) => {
    const id = safeStr(ind?.id);
    if (!id) return;

    const pillar = pillars.includes(String(ind?.pillar || '').toUpperCase())
      ? String(ind.pillar).toUpperCase()
      : null;

    const score = computeFinalScoreLite(ind);
    const finalClass = classifyFinalLite(score, ind);

    indicatorScores[id] = { finalScore: score, finalClass, pillar };

    if (statusCounts[finalClass] != null) statusCounts[finalClass] += 1;

    if (pillar && finalClass !== 'NA') {
      pillarCnt[pillar] += 1;
      pillarSum[pillar] += score == null ? 0 : score;
    }

    // trava crítica (quando disponível): conflito Validado vs Negado em indicador crítico
    const idNum = Number(ind?.id);
    if (Number.isFinite(idNum) && CRITICAL_IDS.includes(idNum)) {
      const sp = normalizeStatusLite(ind?.statusPrincipal ?? 'Pendente');
      const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');
      if ((sp === 'Validado' && sr === 'Negado') || (sp === 'Negado' && sr === 'Validado')) {
        hasCriticalConflict = true;
      }
    }
  });

  const scorePorPilar = {
    E: pillarCnt.E ? Math.round(pillarSum.E / pillarCnt.E) : 0,
    S: pillarCnt.S ? Math.round(pillarSum.S / pillarCnt.S) : 0,
    G: pillarCnt.G ? Math.round(pillarSum.G / pillarCnt.G) : 0,
  };

  const scoreTotal = Math.round((scorePorPilar.E + scorePorPilar.S + scorePorPilar.G) / 3);

  // disparidade lite: se houver conflito crítico, sinaliza; senão, mantém false (sem cálculo por role)
  const disparity = !!hasCriticalConflict;

  /** @type {Record<string, boolean>} */
  const requiresConsensusById = {};
  Object.keys(indicatorScores).forEach((id) => {
    const ind = list.find((x) => safeStr(x?.id) === id);
    const sp = normalizeStatusLite(ind?.statusPrincipal ?? 'Pendente');
    const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');
    requiresConsensusById[id] = disparity ? sp !== sr : false;
  });

  return { scoreTotal, scorePorPilar, statusCounts, indicatorScores, disparity, requiresConsensusById };
}

function resolveKPIs(kpis, snapshot, indicators) {
  // If KPIs are provided explicitly, use them directly.
  if (kpis && typeof kpis === 'object') return kpis;

  const list = Array.isArray(indicators)
    ? indicators
    : Array.isArray(snapshot?.indicators)
      ? snapshot.indicators
      : [];

  return computeKPIsLite(list);
}

/* ==========================================================================
  Recomendações (Plano de Ação)
============================================================================ */

/**
 * Sugere “área responsável” baseada no pilar ESG.
 * @param {any} pillar
 * @returns {string}
 */
function suggestResponsible(pillar) {
  const p = safeStr(pillar).toUpperCase();
  if (p === 'E') return 'Equipe ambiental';
  if (p === 'S') return 'RH / Responsável social';
  if (p === 'G') return 'Jurídico / Compliance';
  return 'Responsável designado';
}

/**
 * Sugere prazo em dias baseado na prioridade.
 * - Negado => 90
 * - Condicionante => 60
 * - Pendente => 30
 * @param {string} priority
 * @returns {number}
 */
function suggestDeadlineDays(priority) {
  const p = safeStr(priority).toLowerCase();
  if (p.includes('máxima') || p.includes('maxima')) return 90;
  if (p.includes('alta')) return 60;
  return 30;
}

/**
 * Recomendações genéricas para tratar lacunas (não presume documentos proprietários).
 * @param {Indicator} indicator
 * @returns {string[]}
 */
function buildGenericRecommendations(indicator) {
  const name = safeStr(indicator?.title || indicator?.name || indicator?.code) || 'o indicador';
  return [
    `Revisar políticas e procedimentos relacionados a ${name}.`,
    'Designar um responsável e registrar ações em atas ou relatórios.',
    'Implementar controles adicionais conforme necessário e documentar a execução.',
    'Monitorar o progresso e atualizar status junto à equipe de auditoria.',
  ];
}

/** @returns {string} */
function genericEvidenceExamples() {
  return 'Exemplos: políticas formalizadas, atas de reunião, registros de treinamento, relatórios de auditoria interna e documentos oficiais que comprovem implementação.';
}

/* ==========================================================================
  Public API — Plano de Ação (fragmento)
============================================================================ */

export function generateActionPlanHTML({
  process = null,
  kpis = null,
  indicators = null,
  snapshot = null,
  options = {},
} = {}) {
  void options;

  /** @type {Indicator[]} */
  const stateIndicators = Array.isArray(indicators)
    ? indicators
    : Array.isArray(snapshot?.indicators)
      ? snapshot.indicators
      : [];

  const metrics = resolveKPIs(kpis, snapshot, stateIndicators);
  const scores = metrics?.indicatorScores || {};

  // Metadados (sessão + processo)
  const sess = sessionState?.session || {};
  const company = safeStr(sess.company || process?.company) || '—';
  const cnpj = safeStr(sess.cnpj || process?.cnpj) || '—';
  const city = safeStr(sess.city || process?.city) || '—';
  const sector = safeStr(sess.sector || process?.sector) || '—';

  let cycleYear = '—';
  try {
    const dateSrc = process?.cycleYear || process?.dueAt || process?.submittedAt || process?.updatedAt || null;
    if (dateSrc) {
      const d = new Date(dateSrc);
      if (!Number.isNaN(d.getTime())) cycleYear = String(d.getFullYear());
    }
  } catch {
    cycleYear = '—';
  }

  // lookup por id (suporta id numérico e string)
  /** @param {string} id @returns {Indicator} */
  function findIndicatorById(id) {
    const numId = Number(id);
    return (
      stateIndicators.find((ind) => Number(ind?.id) === numId) ||
      stateIndicators.find((ind) => safeStr(ind?.id) === id) ||
      /** @type {Indicator} */ ({ id })
    );
  }

  // coleta lacunas (negado/condicionante/pendente)
  const gapEntries = Object.entries(scores).filter(([, v]) => {
    const cls = safeStr(v?.finalClass);
    return cls === 'Negado' || cls === 'Condicionante' || cls === 'Pendente';
  });

  // ordena por severidade
  const severityRank = (cls) => (cls === 'Negado' ? 0 : cls === 'Condicionante' ? 1 : 2);
  gapEntries.sort((a, b) => severityRank(a[1]?.finalClass) - severityRank(b[1]?.finalClass));

  const actions = gapEntries.map(([id, info]) => {
    const indicator = findIndicatorById(id);

    const title =
      safeStr(indicator?.title || indicator?.name || indicator?.code) || `Indicador ${id}`;

    const pillar = safeStr(info?.pillar || indicator?.pillar) || '—';

    const statusClass = safeStr(info?.finalClass) || 'Pendente';
    const priority = statusClass === 'Negado' ? 'Máxima' : statusClass === 'Condicionante' ? 'Alta' : 'Operacional';

    const deadlineDays = suggestDeadlineDays(priority);
    const deadlineIso = isoPlusDays(deadlineDays);
    const deadlineHuman = deadlineIso ? `${deadlineDays} dias (${formatDateBR(deadlineIso)})` : `${deadlineDays} dias`;

    const problem = `Lacuna identificada no indicador ${title} (${pillar}).`;
    const recommendations = buildGenericRecommendations(indicator);
    const evidenceDesc = genericEvidenceExamples();
    const responsible = suggestResponsible(pillar);
    const completion =
      'Considera-se concluído quando a evidência apresentada for avaliada como suficiente e o status final for atualizado.';

    return { id, title, pillar, priority, statusClass, problem, recommendations, evidenceDesc, responsible, deadlineHuman, completion };
  });

  const metaHtml = `
<div class="meta-grid keep-together">
  <div class="meta-item"><span class="meta-key">Organização</span><span class="meta-val">${escapeHtml(company)}</span></div>
  <div class="meta-item"><span class="meta-key">CNPJ</span><span class="meta-val">${escapeHtml(cnpj)}</span></div>
  <div class="meta-item"><span class="meta-key">Local</span><span class="meta-val">${escapeHtml(city)} • ${escapeHtml(sector)}</span></div>
  <div class="meta-item"><span class="meta-key">Ciclo</span><span class="meta-val">${escapeHtml(cycleYear)}</span></div>
</div>`.trim();

  let actionsHtml = '';
  if (actions.length > 0) {
    actionsHtml = actions
      .map((act) => {
        const recHtml = act.recommendations
          .slice(0, 4)
          .map((r) => `<li>${escapeHtml(r)}</li>`)
          .join('');

        const badgeCls = act.priority === 'Máxima' ? 'badge badge--warn' : 'badge';

        return `
<article class="action-item keep-together">
  <h4>${escapeHtml(act.title)} <span class="${badgeCls}">Prioridade ${escapeHtml(act.priority)}</span></h4>
  <p><strong>Status:</strong> ${escapeHtml(act.statusClass)}</p>
  <p><strong>Problema:</strong> ${escapeHtml(act.problem)}</p>
  <p><strong>Recomendações:</strong></p>
  <ul>${recHtml}</ul>
  <p><strong>Evidência esperada:</strong> ${escapeHtml(act.evidenceDesc)}</p>
  <p><strong>Responsável sugerido:</strong> ${escapeHtml(act.responsible)}</p>
  <p><strong>Prazo sugerido:</strong> ${escapeHtml(act.deadlineHuman)}</p>
  <p><strong>Critério de conclusão:</strong> ${escapeHtml(act.completion)}</p>
</article>`.trim();
      })
      .join('\n');
  } else {
    actionsHtml = `
<div class="callout keep-together">
  <strong>Plano de manutenção</strong>
  <p>Não foram identificadas lacunas ou pendências significativas. Recomenda-se:</p>
  <ul>
    <li>Manter monitoramento periódico e evidências organizadas por pilar.</li>
    <li>Revisar políticas quando houver mudanças internas ou regulatórias.</li>
    <li>Realizar auditoria interna anual e registrar atas/relatórios.</li>
  </ul>
</div>`.trim();
  }

  return `
<div class="action-plan">
  <h3>Plano de Ação</h3>
  ${metaHtml}
  ${actionsHtml}
</div>`.trim();
}

/* ==========================================================================
  Documento helper (wrap)
============================================================================ */

/**
 * Envelopa um conteúdo em documento HTML completo (doctype + head + body),
 * usando o CSS unificado deste módulo.
 *
 * @param {Object} params
 * @param {string} params.title Título do documento (head + header)
 * @param {string} params.subtitle Subtítulo / “tipo” (ex.: Parecer Técnico)
 * @param {string} params.metaRight HTML curto para meta do header (lado direito)
 * @param {string} params.body HTML do conteúdo principal (já escapado quando aplicável)
 * @param {string=} params.footerLeft Texto rodapé (esquerda)
 * @param {string=} params.footerRight Texto rodapé (direita)
 * @returns {string}
 */
function wrapDocumentHTML({
  title,
  subtitle,
  metaRight,
  body,
  footerLeft = '',
  footerRight = '',
}) {
  const css = getDocumentStylesCSS();

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="ncs-doc">
      <header class="doc-header">
        <div>
          <div class="doc-brand">NCS — Governança &amp; Impacto</div>
          <div class="doc-title">${escapeHtml(subtitle)}</div>
        </div>
        <div class="doc-meta">
          ${metaRight}
        </div>
      </header>

      <main class="doc-body">
        ${body}
      </main>

      <footer class="doc-footer">
        <div>${escapeHtml(footerLeft)}</div>
        <div>${escapeHtml(footerRight)}</div>
      </footer>
    </div>
  </body>
</html>`;
}

/* ==========================================================================
  Parecer Técnico (documento)
============================================================================ */

/**
 * Gera o HTML completo de um Parecer Técnico.
 *
 * Regras de consistência:
 * - Se `snapshot` for fornecido, usa KPIs lite para coerência com o snapshot.
 * - Se não houver `statusFinal`, a “coluna Final” segue:
 *   - quando houver KPIs: finalClass (Validado/Condicionante/Negado/NA/Pendente)
 *   - fallback: se principal==revisor => esse status, senão "Pendente"
 *
 * @param {ReportSnapshot|null} snapshot
 * @returns {string}
 */
export function generateTechnicalOpinionHTML(snapshot = null) {
  // When a snapshot is not provided, fall back to an empty ReportSnapshot.
  const state = snapshot || /** @type {ReportSnapshot} */ ({ indicators: [], processes: [] });
  const indicators = Array.isArray(state.indicators) ? state.indicators : [];

  const kpis = resolveKPIs(null, snapshot, indicators);
  const scores = kpis?.indicatorScores || {};

  const counts = kpis?.statusCounts || {};
  const scValid = counts?.Validado ?? 0;
  const scCond = counts?.Condicionante ?? 0;
  const scNeg = counts?.Negado ?? 0;
  const scPend = counts?.Pendente ?? 0;
  const scNA = counts?.NA ?? 0;

  const totalScore = Number.isFinite(Number(kpis?.scoreTotal)) ? `${Math.round(Number(kpis.scoreTotal))}%` : '—';
  const p = kpis?.scorePorPilar || {};
  const scoreE = Number.isFinite(Number(p.E)) ? `${Math.round(Number(p.E))}%` : '—';
  const scoreS = Number.isFinite(Number(p.S)) ? `${Math.round(Number(p.S))}%` : '—';
  const scoreG = Number.isFinite(Number(p.G)) ? `${Math.round(Number(p.G))}%` : '—';

  const proc = Array.isArray(state.processes) && state.processes.length > 0 ? state.processes[0] : null;
  const sess = sessionState?.session || {};

  const company = safeStr(sess.company || proc?.company) || '—';
  const cnpj = safeStr(sess.cnpj || proc?.cnpj) || '—';
  const processId = safeStr(proc?.id || proc?.processId || '') || '—';

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

  const emittedAt = formatDateBR();

  // Status consolidado recomendado (conservador + disparidade)
  let consolidatedStatus = 'Em validação';
  if (scNeg > 0) consolidatedStatus = 'Negado';
  else if (scPend > 0 || scCond > 0) consolidatedStatus = 'Em validação';
  else consolidatedStatus = 'Validado';

  // Se houver disparidade e itens exigindo consenso, explicita
  const requires = kpis?.requiresConsensusById || {};
  const consensusIds = Object.keys(requires).filter((id) => requires[id]);
  if (kpis?.disparity && consensusIds.length > 0) consolidatedStatus = 'Pendente de consenso';

  const rows = indicators
    .map((ind) => {
      const id = safeStr(ind?.id);
      if (!id) return '';

      const name = safeStr(ind?.title || ind?.name || ind?.code) || `Indicador ${id}`;
      const sp = normalizeStatusLite(ind?.statusPrincipal ?? 'Pendente');
      const sr = normalizeStatusLite(ind?.statusRevisor ?? 'Pendente');

      const explicitFinal = safeStr(ind?.statusFinal);
      const finalFromKpi = safeStr(scores?.[id]?.finalClass);
      const finalFallback = sp === sr ? sp : 'Pendente';

      const finalLabel = explicitFinal
        ? normalizeStatusLite(explicitFinal)
        : finalFromKpi
          ? /** @type {any} */ (finalFromKpi) // já vem “Validado/Condicionante/Negado/NA/Pendente”
          : finalFallback;

      const score = scores?.[id]?.finalScore;
      const scoreStr = score == null ? '—' : `${Math.round(Number(score))}%`;

      const needsConsensus = !!requires[id];
      const consensusMark = needsConsensus ? ' <span class="badge badge--warn">consenso</span>' : '';

      return `<tr>
  <td>${escapeHtml(id)}</td>
  <td>${escapeHtml(name)}${consensusMark}</td>
  <td>${escapeHtml(sp)}</td>
  <td>${escapeHtml(sr)}</td>
  <td>${escapeHtml(String(finalLabel))}</td>
  <td>${escapeHtml(scoreStr)}</td>
</tr>`;
    })
    .filter(Boolean)
    .join('\n');

  const tableHtml = `
<table class="ncs-table">
  <thead>
    <tr>
      <th style="width:70px;">ID</th>
      <th>Indicador</th>
      <th style="width:120px;">Principal</th>
      <th style="width:120px;">Revisor</th>
      <th style="width:110px;">Final</th>
      <th style="width:110px;">Pontuação</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`.trim();

  let disparityMsg = '';
  if (kpis?.disparity && consensusIds.length > 0) {
    const names = consensusIds.map((id) => {
      const numId = Number(id);
      const found = indicators.find((x) => Number(x?.id) === numId) || indicators.find((x) => safeStr(x?.id) === id);
      return safeStr(found?.title || found?.name || found?.code) || `Indicador ${id}`;
    });

    const listHtml = names.length ? names.map((n) => `<li>${escapeHtml(n)}</li>`).join('') : '<li>—</li>';

    disparityMsg = `
<div class="callout callout--warning keep-together">
  <strong>Trava de disparidade</strong>
  <p>Foi identificada divergência entre avaliador principal e revisor. Indicadores que exigem consenso:</p>
  <ul>${listHtml}</ul>
</div>`.trim();
  }

  const explanation = `Metodologia 50/50: a pontuação de cada indicador é a média simples entre avaliador principal e revisor (Validado = 100%, Condicionante = 50%, Negado = 0%). Itens “Não se aplica” não entram no cálculo do indicador. A trava de disparidade pode ser acionada quando houver conflito em indicador crítico e/ou divergência relevante; por padrão, considera-se threshold de ${DISPARITY_THRESHOLD} p.p.`;

  const metaRight = `
<div><span class="doc-meta-key">Processo</span> ${escapeHtml(processId)}</div>
<div><span class="doc-meta-key">Emissão</span> ${escapeHtml(emittedAt)}</div>`.trim();

  const body = `
<h1>Parecer Técnico</h1>

<div class="meta-grid keep-together">
  <div class="meta-item"><span class="meta-key">Organização</span><span class="meta-val">${escapeHtml(company)}</span></div>
  <div class="meta-item"><span class="meta-key">CNPJ</span><span class="meta-val">${escapeHtml(cnpj)}</span></div>
  <div class="meta-item"><span class="meta-key">Processo</span><span class="meta-val">${escapeHtml(processId)}</span></div>
  <div class="meta-item"><span class="meta-key">Ciclo</span><span class="meta-val">${escapeHtml(cycleYear)}</span></div>
</div>

<div class="callout keep-together">
  <div><strong>Status consolidado recomendado:</strong> ${escapeHtml(consolidatedStatus)}</div>
  <div><strong>Pontuação total:</strong> ${escapeHtml(totalScore)}</div>
  <div><strong>Pontuação por pilar:</strong> E = ${escapeHtml(scoreE)}, S = ${escapeHtml(scoreS)}, G = ${escapeHtml(scoreG)}</div>
  <div><strong>Contagem por status:</strong> Validado ${escapeHtml(String(scValid))}, Condicionante ${escapeHtml(String(scCond))}, Negado ${escapeHtml(String(scNeg))}, Pendentes ${escapeHtml(String(scPend))}, N/A ${escapeHtml(String(scNA))}</div>
</div>

${disparityMsg}

<h2>Tabela de indicadores</h2>
${tableHtml}

<div class="callout keep-together">
  <p class="small"><em>${escapeHtml(explanation)}</em></p>
</div>

<div class="signature-block keep-together">
  <div class="signature-line"></div>
  <div class="signature-caption">Assinatura — responsável pela emissão</div>
  <div class="signature-meta">NCS — Governança &amp; Impacto</div>
</div>`.trim();

  return wrapDocumentHTML({
    title: 'Parecer Técnico — NCS',
    subtitle: 'Parecer Técnico',
    metaRight,
    body,
    footerLeft: `Ciclo: ${cycleYear}`,
    footerRight: 'Documento: Parecer Técnico',
  });
}

/* ==========================================================================
  Certificado / Selo (documento)
============================================================================ */

/**
 * Gera o HTML de um Certificado / Selo do programa (documento completo).
 *
 * Inclui:
 * - Identificação da organização (razão social e CNPJ)
 * - Ciclo e status consolidado
 * - Pontuação geral e por pilar (quando disponível)
 * - Validade (padrão: 12 meses a partir da emissão)
 * - ID verificável e URL (se fornecida / sanitizada)
 * - Placeholder de QR code (o protótipo não gera QR real)
 * - Aviso de uso do selo
 *
 * Observações importantes (higiene):
 * - Não inventa domínio externo quando `publicUrl` é vazio.
 * - Sanitiza `publicUrl` com safeUrl() (evita javascript:).
 *
 * @param {Object} [params]
 * @param {Process|null} [params.process=null]
 * @param {KPIs|null} [params.kpis=null]
 * @param {string} [params.publicUrl=''] URL verificável (http(s) ou path relativo)
 * @param {string|Date|null} [params.validity=null] ISO/Date; fallback: +12 meses
 * @param {ReportSnapshot|null} [params.snapshot=null] opcional, para coerência de KPIs
 * @returns {string}
 */
export function generateSealCertificateHTML({
  process = null,
  kpis = null,
  publicUrl = '',
  validity = null,
  snapshot = null,
} = {}) {
  
  const sess = sessionState?.session || {};
  const company = safeStr(process?.company || sess.company) || '—';
  const cnpj = safeStr(process?.cnpj || sess.cnpj) || '—';

  // ciclo
  let cycleYear = '—';
  try {
    const dateSrc = process?.cycleYear || process?.dueAt || process?.submittedAt || process?.updatedAt || null;
    if (dateSrc) {
      const d = new Date(dateSrc);
      if (!Number.isNaN(d.getTime())) cycleYear = String(d.getFullYear());
    }
  } catch {
    cycleYear = '—';
  }

  // KPIs (coerentes com snapshot/indicadores quando aplicável)
  const kpisResolved = resolveKPIs(kpis, snapshot, snapshot?.indicators || null);

  const counts = kpisResolved?.statusCounts || {};
  const scNeg = counts?.Negado ?? 0;
  const scCond = counts?.Condicionante ?? 0;
  const scPend = counts?.Pendente ?? 0;

  // status consolidado (corrige bug legado)
  let status = 'Em validação';
  if (scNeg > 0) status = 'Negado';
  else if (scPend > 0 || scCond > 0) status = 'Em validação';
  else status = 'Validado';

  const totalScore = Number.isFinite(Number(kpisResolved?.scoreTotal)) ? `${Math.round(Number(kpisResolved.scoreTotal))}%` : '—';
  const pp = kpisResolved?.scorePorPilar || {};
  const scoreE = Number.isFinite(Number(pp.E)) ? `${Math.round(Number(pp.E))}%` : '—';
  const scoreS = Number.isFinite(Number(pp.S)) ? `${Math.round(Number(pp.S))}%` : '—';
  const scoreG = Number.isFinite(Number(pp.G)) ? `${Math.round(Number(pp.G))}%` : '—';

  // validade: +12 meses default
  let validDate = null;
  try {
    if (validity instanceof Date) validDate = new Date(validity);
    else if (typeof validity === 'string' && validity.trim()) {
      const d = new Date(validity);
      if (!Number.isNaN(d.getTime())) validDate = d;
    }
  } catch {
    validDate = null;
  }
  if (!validDate) {
    try {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      validDate = d;
    } catch {
      validDate = null;
    }
  }
  const validityStr = validDate ? validDate.toLocaleDateString('pt-BR') : '—';

  // ID verificável (tenta extrair do URL; fallback rand)
  let certificateId = '';
  try {
    const u = safeStr(publicUrl);
    if (u) {
      const parts = u.split('/').filter(Boolean);
      certificateId = parts[parts.length - 1] || '';
    }
  } catch {
    certificateId = '';
  }
  if (!certificateId) certificateId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  // link verificável (sanitizado)
  const verifyLink = safeUrl(publicUrl) || (certificateId ? safeUrl(`/verify/${encodeURIComponent(certificateId)}`) : '');
  const verifyLinkHtml = verifyLink
    ? `<a href="${escapeHtml(verifyLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(verifyLink)}</a>`
    : '—';

  const emittedAt = formatDateBR();
  const processId = safeStr(process?.id || process?.processId || '') || '—';

  const metaRight = `
<div><span class="doc-meta-key">Processo</span> ${escapeHtml(processId)}</div>
<div><span class="doc-meta-key">Emissão</span> ${escapeHtml(emittedAt)}</div>`.trim();

  const body = `
<h1>Certificado / Selo</h1>

<div class="meta-grid keep-together">
  <div class="meta-item"><span class="meta-key">Organização</span><span class="meta-val">${escapeHtml(company)}</span></div>
  <div class="meta-item"><span class="meta-key">CNPJ</span><span class="meta-val">${escapeHtml(cnpj)}</span></div>
  <div class="meta-item"><span class="meta-key">Processo</span><span class="meta-val">${escapeHtml(processId)}</span></div>
  <div class="meta-item"><span class="meta-key">Ciclo</span><span class="meta-val">${escapeHtml(cycleYear)}</span></div>
</div>

<div class="callout keep-together">
  <div><strong>Status:</strong> ${escapeHtml(status)}</div>
  <div><strong>Pontuação total:</strong> ${escapeHtml(totalScore)}</div>
  <div style="margin-top:6px;"><strong>Pontuação por pilar:</strong></div>
  <ul style="margin:6px 0 0 18px;">
    <li>E (Ambiente): ${escapeHtml(scoreE)}</li>
    <li>S (Social): ${escapeHtml(scoreS)}</li>
    <li>G (Governança): ${escapeHtml(scoreG)}</li>
  </ul>
</div>

<div class="callout keep-together">
  <div style="display:flex; gap:16px; align-items:flex-start; justify-content:space-between;">
    <div>
      <div><strong>ID do certificado:</strong> ${escapeHtml(certificateId)}</div>
      <div style="margin-top:6px;"><strong>URL verificável:</strong> ${verifyLinkHtml}</div>
      <div class="small" style="margin-top:8px;">Use o link/QR para conferência pública do status e do ciclo.</div>
    </div>
    <div>
      <div class="qr-placeholder">QR Code</div>
    </div>
  </div>
</div>

<div class="callout callout--warning keep-together">
  <p><strong>Aviso de uso do selo:</strong> O selo somente pode ser utilizado após status <em>Validado</em>. A licença é pessoal e intransferível, vinculada ao CNPJ avaliado, com validade de 12 meses contados da emissão. É proibido alterar a arte do selo, aplicá-lo a produtos ou terceiros, ou utilizá-lo antes da validação final. O selo deve ser removido após o término de sua validade.</p>
</div>

<div class="signature-grid keep-together">
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-caption">Assinatura — responsável pela emissão</div>
    <div class="signature-meta">NCS — Governança &amp; Impacto</div>
  </div>
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-caption">Assinatura — representante da organização</div>
    <div class="signature-meta">${escapeHtml(company)}</div>
  </div>
</div>`.trim();

  return wrapDocumentHTML({
    title: 'Certificado / Selo — NCS',
    subtitle: 'Certificado / Selo',
    metaRight,
    body,
    footerLeft: `ID: ${certificateId}`,
    footerRight: `Validade: ${validityStr}`,
  });
}
