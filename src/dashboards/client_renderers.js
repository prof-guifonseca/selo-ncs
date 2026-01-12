/**
 * @file src/dashboards/client_renderers.js
 * @module dashboards/client_renderers
 *
 * Pure renderers for the participant (client) dashboard.  These
 * functions produce deterministic HTML fragments based solely on their
 * inputs and never interact directly with the DOM.  They are
 * extracted from `src/dashboards/client.js` to reduce the size and
 * complexity of the orchestrator.  When interpolating values into
 * templates all content is escaped via helpers from the shared
 * dashboard module to mitigate HTML injection.
 */

import { escapeHtml, normalizePillar, sortByPillarThenCode, PILLARS } from './shared.js';
import {
  renderKpiCard,
  renderEmptyState,
  renderPillarDivider,
  renderStrongMuted,
} from '../shared/blocks.js';

/**
 * Ensures the shape of the self assessment object for an indicator
 * without mutating the original indicator.  The returned object
 * contains string properties `answer` and `note` and an array
 * property `evidenceIds`.  When the indicator has no self field a
 * default object is returned.
 *
 * @param {any} ind
 * @returns {{ answer: string, note: string, evidenceIds: string[] }}
 */
function ensureIndicatorSelfLocal(ind) {
  const self = (ind && typeof ind === 'object' && ind.self && typeof ind.self === 'object') ? { ...ind.self } : {};
  const out = {
    answer: '',
    note: '',
    evidenceIds: [],
  };
  if (typeof self.answer === 'string') out.answer = self.answer.trim();
  if (typeof self.note === 'string') out.note = self.note;
  if (Array.isArray(self.evidenceIds)) out.evidenceIds = self.evidenceIds.map((x) => String(x));
  return out;
}

/**
 * Returns a placeholder text for the note input based on the selected
 * answer.  Mirrors the logic in the client dashboard and must be
 * kept in sync with the orchestrator.  When the answer is 'Não'
 * returns a hint asking for a gap description; when 'N/A' asks for
 * justification; otherwise returns a generic placeholder.
 *
 * @param {string} answer
 * @returns {string}
 */
function buildSelfNotePlaceholder(answer) {
  const a = String(answer || '').trim();
  return a === 'Não'
    ? 'Descreva o gap (o que falta, impacto e próximo passo)…'
    : a === 'N/A'
      ? 'Justifique a não aplicabilidade (por que não se aplica ao seu contexto)…'
      : 'Opcional: contexto e referência interna (política, procedimento, responsável)…';
}

/**
 * Renders the HTML for the participant’s self assessment table.  This
 * helper takes a list of indicators and a list of evidences and
 * constructs a table with rows for each indicator, grouped by
 * pillar.  The `evidences` array is expected to contain objects
 * with at least `id`, `pillar` and `name` properties.  The caller
 * should normalise all inputs before passing them in.  The return
 * value is a complete HTML string ready to be injected into the
 * `.innerHTML` of a container element.
 *
 * @param {any[]} indicators List of indicator objects
 * @param {any[]} evidences List of evidence objects
 * @returns {string} HTML string representing the self assessment table
 */
export function renderClientSelfAssessmentHtml(indicators = [], evidences = []) {
  const list = Array.isArray(indicators) ? indicators : [];
  const evs = Array.isArray(evidences) ? evidences : [];
  // Count answered indicators (Sim, Não, N/A)
  let answered = 0;
  list.forEach((ind) => {
    const self = ensureIndicatorSelfLocal(ind);
    const a = self.answer;
    if (a === 'Sim' || a === 'Não' || a === 'N/A') answered += 1;
  });
  // Begin building HTML
  let html = '';
  // Summary
  html += '<div class="self-summary">';
  html += '<p class="muted" style="margin: 0 0 .75rem 0">';
  html += '<span class="meta-chip">Respondidos: <span aria-live="polite">' + answered + '/' + list.length + '</span></span>';
  html += '<span class="meta-chip">Regra: “Sim” com evidência; “Não” com gap; “N/A” com justificativa.</span>';
  html += '</p>';
  html += '</div>';
  // Table header
  html += '<div class="table-wrap"><table class="self-table" aria-label="Tabela de autoavaliação do participante">';
  html += '<thead><tr>';
  html += '<th scope="col">Indicador</th>';
  html += '<th scope="col">Resposta</th>';
  html += '<th scope="col">Justificativa / gap</th>';
  html += '<th scope="col">Evidências vinculadas</th>';
  html += '</tr></thead><tbody>';
  // Sort indicators by pillar/code
  const sorted = list.slice().sort(sortByPillarThenCode);
  let currentPillar = null;
  // Local mapping for pillar labels
  const PILLAR_LABEL_LOCAL = { E: 'Ambiental (E)', S: 'Social (S)', G: 'Governança (G)' };
  // Answer options
  const ANSWERS = ['—', 'Sim', 'Não', 'N/A'];
  sorted.forEach((ind) => {
    const pillar = normalizePillar(ind?.pillar);
    if (pillar !== currentPillar) {
      currentPillar = pillar;
      const label = PILLAR_LABEL_LOCAL[pillar] || pillar;
      html += renderPillarDivider(pillar, label, 4);
    }
    const self = ensureIndicatorSelfLocal(ind);
    const indId = String(ind?.id ?? '');
    const currentAnswer = self.answer;
    const placeholder = buildSelfNotePlaceholder(currentAnswer);
    // Evidence list for this indicator (filter by pillar)
    const evList = evs.filter((ev) => ev && normalizePillar(ev.pillar) === pillar);
    const selectedSet = new Set(self.evidenceIds.map(String));
    const n = self.evidenceIds.length;
    const size = Math.min(4, Math.max(2, evList.length ? 3 : 2));
    // Indicator name
    const name = ind && (ind.name || ind.title) ? String(ind.name || ind.title) : ('Indicador ' + (ind.id || ''));
    html += '<tr data-indicator-id="' + escapeHtml(indId) + '">';
    // Column 1: indicator
    html += '<td>' + renderStrongMuted(name, 'Pilar: ' + (pillar ?? '')) + '</td>';
    // Column 2: answer
    html += '<td><select class="self-answer" data-indicator-id="' + escapeHtml(indId) + '" aria-label="Resposta do indicador ' + escapeHtml(indId) + '">';
    ANSWERS.forEach((opt) => {
      const val = opt === '—' ? '' : opt;
      const selected = ((opt === '—' && !currentAnswer) || currentAnswer === opt) ? ' selected' : '';
      html += '<option value="' + escapeHtml(val) + '"' + selected + '>' + escapeHtml(opt) + '</option>';
    });
    html += '</select>';
    html += '<div class="input-help self-row-hint" data-hint-for="' + escapeHtml(indId) + '" aria-live="polite"></div></td>';
    // Column 3: note
    html += '<td><textarea class="self-note" rows="2" data-indicator-id="' + escapeHtml(indId) + '" aria-label="Justificativa do indicador ' + escapeHtml(indId) + '" placeholder="' + escapeHtml(placeholder) + '">' + escapeHtml(self.note) + '</textarea></td>';
    // Column 4: evidence select
    html += '<td><select class="self-evidence" multiple size="' + size + '" data-indicator-id="' + escapeHtml(indId) + '" aria-label="Evidências vinculadas ao indicador ' + escapeHtml(indId) + '">';
    if (evList.length === 0) {
      html += '<option value="" disabled selected>(Sem evidências disponíveis neste pilar)</option>';
    } else {
      evList.forEach((ev) => {
        const evId = String(ev.id);
        const selectedAttr = selectedSet.has(evId) ? ' selected' : '';
        const evName = ev && ev.name ? String(ev.name) : ('Evidência ' + ev.id);
        html += '<option value="' + escapeHtml(evId) + '"' + selectedAttr + '>' + escapeHtml(evName) + '</option>';
      });
    }
    html += '</select>';
    html += '<div class="muted" data-ev-count-for="' + escapeHtml(indId) + '">' + (n ? (n + ' vinculada(s)') : 'Nenhuma vinculada') + '</div></td>';
    html += '</tr>';
  });
  // When no indicators, show empty pillar dividers for E/S/G
  if (sorted.length === 0) {
    PILLARS.forEach((p) => {
      const label = { E: 'Ambiental (E)', S: 'Social (S)', G: 'Governança (G)' }[p] || p;
      html += renderPillarDivider(p, label, 4);
    });
  }
  html += '</tbody></table></div>';
  return html;
}

/**
 * Renders the HTML for the indicators overview table.  This helper
 * mirrors the implementation previously embedded in client.js and
 * constructs a read‑only summary table showing pillar, answer,
 * evidence count and status.  When the list is empty a muted
 * message is returned.
 *
 * @param {any[]} indicators List of indicator objects
 * @returns {string} HTML string representing the overview table
 */
export function renderClientIndicatorsOverviewHtml(indicators = []) {
  const list = Array.isArray(indicators) ? indicators : [];
  if (!list.length) {
    return '<p class="muted">Sem indicadores carregados.</p>';
  }
  const sorted = list.slice().sort(sortByPillarThenCode);
  let html = '';
  html += '<table class="table-like" aria-label="Resumo dos indicadores do ciclo">';
  html += '<thead><tr>';
  html += '<th scope="col">Indicador</th>';
  html += '<th scope="col">Pilar</th>';
  html += '<th scope="col">Resposta</th>';
  html += '<th scope="col">Evidências</th>';
  html += '<th scope="col">Status</th>';
  html += '</tr></thead>';
  html += '<tbody>';
  let currentPillar = null;
  const PILLAR_LABEL_LOCAL = { E: 'Ambiental (E)', S: 'Social (S)', G: 'Governança (G)' };
  sorted.forEach((ind) => {
    const pillar = normalizePillar(ind?.pillar);
    if (pillar !== currentPillar) {
      currentPillar = pillar;
      const label = PILLAR_LABEL_LOCAL[currentPillar] || currentPillar;
      html += renderPillarDivider(currentPillar, label, 5);
    }
    const code = String(ind?.code || ind?.id || '');
    let title = String(ind?.title || ind?.name || 'Indicador');
    title = title.replace(/^\s*\d+\s+/, '').trim();
    const ansRaw = (ind?.self && ind.self.answer) || '';
    const mapAns = {
      yes: 'Sim',
      no: 'Não',
      partial: 'Em implementação',
      na: 'N/A',
      '': 'Pendente',
      undefined: 'Pendente',
    };
    const ansKey = String(ansRaw || '').trim();
    const ans = Object.prototype.hasOwnProperty.call(mapAns, ansKey) ? mapAns[ansKey] : ansKey || 'Pendente';
    const count = Array.isArray(ind?.self?.evidenceIds) ? ind.self.evidenceIds.length : 0;
    let status = '';
    if (ind?.final && ind.final.status) status = String(ind.final.status);
    else if (ind?.auditor && ind.auditor.status) status = String(ind.auditor.status);
    else if (ind?.reviewer && ind.reviewer.status) status = String(ind.reviewer.status);
    status = status ? status.trim() : '';
    html += '<tr data-indicator-code="' + escapeHtml(code) + '">';
    html += '<td><div class="text-strong">' + escapeHtml(title) + '</div></td>';
    html += '<td>' + escapeHtml(pillar || '') + '</td>';
    html += '<td>' + escapeHtml(ans || 'Pendente') + '</td>';
    html += '<td>' + escapeHtml(String(count)) + '</td>';
    html += '<td>' + escapeHtml(status || '—') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// -----------------------------------------------------------------------------
// Additional placeholder renderers
//
// These helpers provide minimal implementations of other rendering
// functions referenced in the tasks.  They may be expanded or
// replaced in the future as the client dashboard evolves.

/**
 * Renders a simple header for the client dashboard.  Accepts an
 * object with arbitrary metadata (e.g. company name) and returns a
 * heading element.  Currently the implementation just escapes the
 * company name and wraps it in an <h2>.  Consumers may extend this
 * to include subheadings or other header content.
 *
 * @param {{ company?: string }} meta
 * @returns {string}
 */
export function renderClientHeader(meta = {}) {
  const company = meta && meta.company ? String(meta.company) : '';
  return `<h2>${escapeHtml(company)}</h2>`;
}

/**
 * Renders a list of processes for the client dashboard.  The
 * participant dashboard typically only shows a single process, but
 * this helper maps any provided list into simple list items.  Each
 * item displays the company name or ID.  The returned string
 * contains a <div> wrapper with class "client-process-list".
 *
 * @param {any[]} processes
 * @returns {string}
 */
export function renderClientProcessList(processes = []) {
  if (!Array.isArray(processes) || processes.length === 0) {
    return renderEmptyState('Sem processos', 'Nenhum processo encontrado.');
  }
  const items = processes.map((p) => {
    const idStr = escapeHtml(String(p?.id ?? ''));
    const company = escapeHtml(p?.company || p?.name || idStr);
    return `<div class="client-process-item" data-id="${idStr}">${company}</div>`;
  });
  return `<div class="client-process-list">${items.join('')}</div>`;
}

/**
 * Renders a simple detail view for a process.  This placeholder
 * implementation shows the company name and status.  The function
 * returns a <div> wrapper; real implementations should expand this
 * markup to include additional metadata and controls.
 *
 * @param {any} process
 * @returns {string}
 */
export function renderClientProcessDetail(process) {
  const company = escapeHtml(process?.company || process?.id || 'Processo');
  const status = escapeHtml(process?.status || '—');
  return `<div class="client-process-detail"><h3>${company}</h3><p>Status: ${status}</p></div>`;
}

/**
 * Renders a KPI section given an array of KPI objects.  Each KPI
 * object should have a `label` and a `value` property.  The helper
 * delegates the individual card rendering to the shared
 * `renderKpiCard` helper and wraps the cards in a <div>.
 *
 * @param {{ label: any, value: any }[]} kpis
 * @returns {string}
 */
export function renderKpiSection(kpis = []) {
  if (!Array.isArray(kpis) || kpis.length === 0) return '';
  const cards = kpis.map((k) => renderKpiCard(k.label, k.value)).join('');
  return `<div class="client-kpi-section">${cards}</div>`;
}

/**
 * Renders a section for deliverables.  Accepts a list of strings or
 * objects and returns a simple list.  This placeholder may be
 * replaced by a richer implementation in the future.
 *
 * @param {any[]} deliverables
 * @returns {string}
 */
export function renderDeliverablesSection(deliverables = []) {
  if (!Array.isArray(deliverables) || deliverables.length === 0) {
    return renderEmptyState('Sem entregáveis', 'Nenhuma entrega disponível.');
  }
  const items = deliverables.map((d) => `<li>${escapeHtml(String(d?.name || d))}</li>`).join('');
  return `<ul class="client-deliverables-list">${items}</ul>`;
}

/**
 * Renders a section for resources (e.g. guides or help articles).
 * Accepts a list of objects with at least a `title` property and
 * returns a simple list.  Placeholder implementation.
 *
 * @param {any[]} resources
 * @returns {string}
 */
export function renderResourcesSection(resources = []) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return renderEmptyState('Sem recursos', 'Nenhum recurso disponível.');
  }
  const items = resources.map((r) => `<li>${escapeHtml(String(r?.title || r))}</li>`).join('');
  return `<ul class="client-resources-list">${items}</ul>`;
}

/**
 * Renders a single evidence card.  Accepts an evidence object with
 * `name` and `id` properties and returns a simple card.  This
 * placeholder may be enhanced to include status or additional
 * metadata.
 *
 * @param {any} evidence
 * @returns {string}
 */
export function renderEvidenceCard(evidence) {
  const idStr = escapeHtml(String(evidence?.id ?? ''));
  const name = escapeHtml(evidence?.name || idStr);
  return `<div class="client-evidence-card" data-evidence-id="${idStr}">${name}</div>`;
}

// Re-export the shared empty state for convenience
export { renderEmptyState } from '../shared/blocks.js';