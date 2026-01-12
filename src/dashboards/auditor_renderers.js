/**
 * @file src/dashboards/auditor_renderers.js
 * @module dashboards/auditor_renderers
 *
 * Pure HTML renderers extracted from the auditor dashboard.  These
 * functions generate deterministic markup and do not touch the DOM.
 * They can be imported by the dashboard orchestrator (auditor.js) to
 * build UI sections using template strings.  Each value interpolated
 * into the templates is escaped using helpers from shared modules to
 * prevent HTML injection.
 */

import {
  PILLARS,
  normalizePillar,
  sortByPillarThenCode,
  formatDateBr,
  escapeHtml,
} from './shared.js';
import { renderChip, renderPillarDivider, renderStrongMuted } from '../shared/blocks.js';
import { PROFILE_QUESTIONS_V1 } from '../profileQuestions.js';

/**
 * Generates the full indicators table for the auditor view.  This
 * implementation sorts indicators by pillar and code, inserts
 * divider rows between ESG pillars and constructs select and
 * textarea controls with appropriate attributes.  When in
 * workspace mode (`isWorkspace` true) the controls are disabled and
 * marked as preview.  All dynamic values are escaped.
 *
 * @param {Array<any>} indicators List of indicators to render
 * @param {{ isWorkspace?: boolean }} [opts]
 * @returns {string} HTML for the complete table
 */
export function renderAuditorIndicatorsHtml(indicators, { isWorkspace = false } = {}) {
  if (!Array.isArray(indicators) || indicators.length === 0) return '';
  // Clone and sort deterministically by pillar then code
  const sorted = indicators.slice().sort(sortByPillarThenCode);
  // Valid status options
  const statusList = ['Pendente', 'Validado', 'Condicionante', 'Negado', 'Não se aplica'];
  // Score map for calculating final average
  const STATUS_SCORE = {
    Validado: 100,
    Condicionante: 50,
    Negado: 0,
    'Não se aplica': null,
    Pendente: null,
  };
  // Map pillar code to friendly label
  const PILLAR_LABEL_MAP = { E: 'Ambiental (E)', S: 'Social (S)', G: 'Governança (G)' };
  let html = '';
  html += '<table class="indicators-table" aria-label="Tabela de indicadores">';
  html +=
    '<thead><tr><th scope="col">Indicador</th><th scope="col">Principal</th><th scope="col">Revisor</th><th scope="col">Nota final</th></tr></thead>';
  html += '<tbody>';
  let currentPillar = null;
  for (const ind of sorted) {
    const pillar = normalizePillar(ind && ind.pillar);
    if (pillar !== currentPillar) {
      currentPillar = pillar;
      const p = String(pillar || '');
      const label = PILLAR_LABEL_MAP[p] || p;
      html += renderPillarDivider(p, label, 4);
    }
    const idStr = ind && ind.id != null ? String(ind.id) : '';
    const indicatorName = escapeHtml(
      String((ind && (ind.name || ind.title || ind.code)) || '')
    );
    html += '<tr>';
    // Name column
    html += '<td>' + renderStrongMuted(indicatorName, 'Pilar: ' + (pillar ?? '')) + '</td>';
    // Build status + note cells for principal and reviewer
    const roles = ['principal', 'revisor'];
    for (const role of roles) {
      const current =
        role === 'principal'
          ? ind && (ind.statusPrincipal || 'Pendente')
          : ind && (ind.statusRevisor || 'Pendente');
      const noteVal =
        role === 'principal'
          ? (ind && ind.notePrincipal) || ''
          : (ind && ind.noteRevisor) || '';
      const disabledAttr = isWorkspace ? ' disabled title="Modo preview"' : '';
      html += '<td>';
      // select
      html += `<select data-indicator-id="${escapeHtml(idStr)}" data-role="${role}" aria-label="Status (${role}) do indicador ${escapeHtml(
        idStr
      )}"${disabledAttr}>`;
      for (const opt of statusList) {
        const selected = current === opt ? ' selected' : '';
        html += `<option value="${opt}"${selected}>${opt}</option>`;
      }
      html += '</select>';
      // textarea
      const isNA = current === 'Não se aplica';
      const placeholder = isNA
        ? 'Motivo de não aplicabilidade (obrigatório)…'
        : 'Comentário…';
      let ph = placeholder;
      let extra = '';
      if (isWorkspace) {
        ph = 'Modo preview';
        extra = ' disabled title="Modo preview"';
      }
      html += `<textarea class="indicator-note" rows="2" data-indicator-id="${escapeHtml(
        idStr
      )}" data-role="${role}" aria-label="Comentário (${role}) do indicador ${escapeHtml(
        idStr
      )}" placeholder="${escapeHtml(ph)}"${extra}>${escapeHtml(String(noteVal || ''))}</textarea>`;
      html += '</td>';
    }
    // Final score column
    let finalText = '—';
    {
      const sp = ind && (ind.statusPrincipal || 'Pendente');
      const sr = ind && (ind.statusRevisor || 'Pendente');
      if (sp === 'Não se aplica' && sr === 'Não se aplica') {
        finalText = 'N/A';
      } else if (sp === 'Pendente' || sr === 'Pendente') {
        finalText = '—';
      } else {
        const a = Object.prototype.hasOwnProperty.call(STATUS_SCORE, sp)
          ? STATUS_SCORE[sp]
          : null;
        const b = Object.prototype.hasOwnProperty.call(STATUS_SCORE, sr)
          ? STATUS_SCORE[sr]
          : null;
        if (a != null && b != null) {
          finalText = String(Math.round((a + b) / 2));
        } else {
          finalText = '—';
        }
      }
    }
    html += `<td><div class="indicator-final-score" data-indicator-id="${escapeHtml(
      idStr
    )}" aria-label="Nota final do indicador ${escapeHtml(idStr)}" aria-live="polite">${finalText}</div></td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

/**
 * Builds the ESG questionnaire summary for a given profile.  It
 * iterates over the predefined questions catalogue and maps the
 * answers to human friendly labels.  Unknown or missing answers
 * produce a dash.  Values are escaped.
 *
 * @param {any} profile The submitted profile (proc.payload.profile)
 * @returns {string} HTML containing question/answer pairs
 */
export function renderAuditorProfileSummaryHtml(profile) {
  if (!profile || !profile.esg) return '';
  const esg = typeof profile.esg === 'object' ? profile.esg : {};
  const parts = [];
  for (const q of PROFILE_QUESTIONS_V1) {
    const qText = escapeHtml(String((q && (q.text || q.id)) || ''));
    const rawAnswer = esg && typeof esg === 'object' ? esg[q.id] : '';
    const ansCode = String(rawAnswer || '').trim();
    const map = { yes: 'Sim', no: 'Não', partial: 'Parcial', na: 'N/A' };
    const ansLabel = Object.prototype.hasOwnProperty.call(map, ansCode)
      ? map[ansCode]
      : ansCode || '—';
    const ansEsc = escapeHtml(ansLabel);
    parts.push(
      `<div class="question-item"><div class="question-label">${qText}</div><div class="question-answer"><span class="answer-chip">${ansEsc}</span></div></div>`
    );
  }
  return parts.join('');
}

/**
 * Generates cards for a list of appeals/recourses.  Each card
 * includes a title, meta chips and a truncated description.  The
 * index of the item is stored in a data attribute for action
 * handlers.  All dynamic values are escaped via helpers.
 *
 * @param {Array<any>} list List of appeals or recourses
 * @returns {string} HTML representing the cards
 */
export function renderAuditorAppealsHtml(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  let out = '';
  for (let i = 0; i < list.length; i++) {
    const app = list[i] || {};
    const idxStr = String(i);
    const titleRaw = (app && (app.title || app.subject)) || `Recurso ${i + 1}`;
    const titleEsc = escapeHtml(String(titleRaw));
    const status = String((app && (app.status || app.state)) || 'Aberto');
    const createdAtRaw = app && (app.createdAt || app.created_at || app.ts);
    const updatedAtRaw = app && (app.updatedAt || app.updated_at);
    let createdLabel = '';
    let updatedLabel = '';
    try {
      createdLabel = createdAtRaw ? formatDateBr(createdAtRaw) : '';
    } catch {
      createdLabel = createdAtRaw ? String(createdAtRaw) : '';
    }
    try {
      updatedLabel = updatedAtRaw ? formatDateBr(updatedAtRaw) : '';
    } catch {
      updatedLabel = updatedAtRaw ? String(updatedAtRaw) : '';
    }
    const rawDesc = String((app && (app.description || app.text || app.message)) || '').trim();
    const bodyTxt = rawDesc.length > 120 ? `${rawDesc.slice(0, 117)}…` : rawDesc || '';
    const bodyEsc = escapeHtml(bodyTxt);
    out += `<div class="appeal-card" data-index="${escapeHtml(idxStr)}" data-action="auditor-appeal-open">`;
    out += `<h4>${titleEsc}</h4>`;
    // Use chip helper to standardise meta chips in appeals
    const chips = [
      renderChip(`Status: ${status}`),
      renderChip(`Criado: ${createdLabel || ''}`),
      renderChip(`Atualizado: ${updatedLabel || ''}`),
    ].join(' ');
    out += `<div class="appeal-meta">${chips}</div>`;
    out += `<p>${bodyEsc}</p>`;
    out += '</div>';
  }
  return out;
}

/**
 * Generates the detail view for a single appeal.  Includes title,
 * meta chips, full description and fixed action buttons.  Data
 * attributes embed the index for event delegation.  Values are
 * escaped to prevent injection.
 *
 * @param {any} app Appeal object
 * @param {number} idx Index of this appeal in the list
 * @returns {string} HTML for the detail view
 */
export function renderAuditorAppealDetailHtml(app, idx) {
  const i = Number(idx);
  const idxStr = String(i);
  const titleRaw = (app && (app.title || app.subject)) || `Recurso ${i + 1}`;
  const titleEsc = escapeHtml(String(titleRaw));
  const status = String((app && (app.status || app.state)) || 'Aberto');
  const createdRaw = app && (app.createdAt || app.created_at || app.ts);
  const updatedRaw = app && (app.updatedAt || app.updated_at);
  let createdTxt = '';
  let updatedTxt = '';
  try {
    createdTxt = createdRaw ? formatDateBr(createdRaw) : '';
  } catch {
    createdTxt = createdRaw ? String(createdRaw) : '';
  }
  try {
    updatedTxt = updatedRaw ? formatDateBr(updatedRaw) : '';
  } catch {
    updatedTxt = updatedRaw ? String(updatedRaw) : '';
  }
  const descRaw = String((app && (app.description || app.text || app.message)) || '').trim();
  const descEsc = escapeHtml(descRaw);
  // Build action buttons markup
  const btnReply = `<button type="button" class="btn btn-primary btn-small" data-action="auditor-appeal-reply" data-index="${escapeHtml(idxStr)}">Responder</button>`;
  const btnRequest = `<button type="button" class="btn btn-secondary btn-small" data-action="auditor-appeal-request-more" data-index="${escapeHtml(idxStr)}">Solicitar complementação</button>`;
  const btnForward = `<button type="button" class="btn btn-secondary btn-small" data-action="auditor-appeal-forward" data-index="${escapeHtml(idxStr)}">Encaminhar à NCS</button>`;
  const buttonsHtml = `<div class="actions-row mt-2">${btnReply}${btnRequest}${btnForward}</div>`;
  // Build meta chips
  const chipsHtml = [
    renderChip(`Status: ${status}`),
    renderChip(`Criado: ${createdTxt || ''}`),
    renderChip(`Atualizado: ${updatedTxt || ''}`),
  ].join(' ');
  return `<h4>${titleEsc}</h4><div class="appeal-meta-detail">${chipsHtml}</div><p>${descEsc}</p>${buttonsHtml}`;
}

/**
 * Renders a simple empty state card for the auditor queue.  When
 * filters are applied the message encourages clearing filters; when
 * no processes are assigned it suggests updating.  The call to
 * action is constructed with a data-action attribute for the
 * orchestrator to handle.  Text is escaped.
 *
 * @param {boolean} anyFiltered Whether filters are applied
 * @returns {string} HTML for the empty state card
 */
export function renderAuditorQueueEmptyHtml(anyFiltered) {
  const message = anyFiltered
    ? 'Nenhum processo encontrado com os filtros aplicados.'
    : 'Nenhum processo designado no momento.';
  const ctaLabel = anyFiltered ? 'Limpar filtros' : 'Atualizar';
  const action = anyFiltered ? 'auditor-clear-filters' : 'auditor-refresh';
  const buttonClass = 'btn btn-secondary btn-small btn-block';
  const btnHtml = ctaLabel
    ? `<button type="button" class="${escapeHtml(buttonClass)}" data-action="${escapeHtml(
        action
      )}">${escapeHtml(ctaLabel)}</button>`
    : '';
  return `<div class="dash-card"><div class="empty-state"><p class="mb-2">${escapeHtml(
    message
  )}</p>${btnHtml}</div></div>`;
}

/**
 * Generates the list of process cards for the auditor queue.  It
 * encapsulates the template logic originally implemented imperatively
 * in the dashboard orchestrator.  Each process is mapped into a
 * clickable card with status chips, metadata and an accessible label.
 * This renderer is pure and interacts only with its input values.
 *
 * @param {Array<any>} processes Array of processes to render
 * @returns {string} HTML representing the list of process items
 */
export function renderAuditorQueueListHtml(processes) {
  if (!Array.isArray(processes) || processes.length === 0) return '';
  const now = new Date();
  // Local helper replicating the SLA categorisation used in the dashboard.
  function getSlaInfo(proc) {
    const out = { category: '', label: '', daysLeft: null };
    try {
      const due = new Date(proc?.dueAt || proc?.updatedAt || proc?.submittedAt || 0);
      const ms = due.getTime() - now.getTime();
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      out.daysLeft = Number.isFinite(days) ? days : null;
      if (out.daysLeft == null) return out;
      if (out.daysLeft < 0) return { ...out, category: 'atrasado', label: 'Atrasado' };
      if (out.daysLeft <= 7) return { ...out, category: 'atencao', label: 'Atenção' };
      return { ...out, category: 'emdia', label: 'Em dia' };
    } catch {
      return out;
    }
  }
  return processes
    .map((proc) => {
      // Determine company display name
      const companyLabel = proc.company || proc.company_name || proc.companyName || 'Empresa';
      const nameEsc = escapeHtml(companyLabel);
      const idEsc = escapeHtml(String(proc.id ?? ''));
      // Top chips: status, stage, SLA
      const statusRaw = proc.status || '—';
      const stageStr = proc.stage || '';
      const { label: slaLabel } = getSlaInfo(proc);
      let chips = renderChip(statusRaw);
      if (stageStr) chips += renderChip(stageStr);
      if (slaLabel) chips += renderChip(slaLabel);
      // Bottom metadata: city, sector, evidence count, update date
      const cityStr = String(proc.city || '').trim();
      const cityEsc = escapeHtml(cityStr);
      const sectorStr = String(proc.sector || '').trim();
      const sectorEsc = escapeHtml(sectorStr);
      const count = Array.isArray(proc.evidenceIds)
        ? proc.evidenceIds.length
        : proc.evidenceCount || 0;
      const countLabel = `${count} evidência${count === 1 ? '' : 's'}`;
      const countEsc = escapeHtml(countLabel);
      const updated = proc.updatedAt || proc.submittedAt || null;
      let dateStr = '—';
      try {
        dateStr = updated ? formatDateBr(updated) : '—';
      } catch {
        dateStr = updated ? String(updated) : '—';
      }
      const updatedLabel = `Atualizado em ${dateStr}`;
      const updatedEsc = escapeHtml(updatedLabel);
      let metaHtml = '';
      if (cityStr) metaHtml += `<span>${cityEsc}</span>`;
      if (sectorStr) metaHtml += `<span>${sectorEsc}</span>`;
      metaHtml += `<span>${countEsc}</span>`;
      metaHtml += `<span>${updatedEsc}</span>`;
      // Aria label for accessibility
      const ariaLabel = escapeHtml(
        `Abrir processo ${companyLabel || proc.id || ''}`.trim()
      );
      return `<div class="process-item" data-action="auditor-open-process" data-id="${idEsc}" role="listitem" tabindex="0" aria-label="${ariaLabel}"><div class="process-top"><span class="process-name">${nameEsc}</span>${chips}</div><div class="process-meta">${metaHtml}</div></div>`;
    })
    .join('');
}