/**
 * @file src/dashboards/admin_renderers.js
 * @module dashboards/admin_renderers
 *
 * Pure renderers for the admin (gestor) dashboard.  These functions
 * produce deterministic HTML fragments based solely on their inputs
 * and never interact directly with the DOM.  They are extracted
 * from `src/dashboards/admin.js` to reduce the size and complexity of
 * the orchestrator.  When interpolating values into templates all
 * content is escaped via helpers from the shared UI module to
 * mitigate HTML injection.
 */

import { h } from '../shared/ui.js';
import { formatDateBr } from './shared.js';
import {
  renderChip,
  renderKpiCard,
  renderMetaRow,
  renderEmptyState,
  renderDetailHeader,
  renderDetailMeta,
  renderButton,
  renderActionsRow,
  renderMutedParagraph,
} from '../shared/blocks.js';

/**
 * Formats a triage status into a human friendly label.  The mapping
 * mirrors the original implementation in admin.js.  Unknown values
 * fall back to the provided raw value or the label "Pendente".
 *
 * @param {string|undefined|null} status
 * @returns {string}
 */
export function formatTriage(status) {
  const s = String(status || '').trim().toUpperCase();
  if (!s) return 'Pendente';
  if (s === 'OK' || s === 'APTO' || s === 'READY') return 'Triagem OK';
  if (s === 'NEEDS_FIXES' || s === 'NEEDS_FIX' || s === 'PENDENTE' || s === 'PENDING') {
    return 'Complemento';
  }
  return String(status || 'Pendente');
}

/**
 * Renders a simple KPI grid based on an array of objects.  Each item
 * should provide a label and a numeric value.  The helper delegates
 * rendering of individual cards to the shared `renderKpiCard` helper.
 *
 * @param {{ label: string, value: number }[]} kpis
 * @returns {string}
 */
export function renderKpis(kpis) {
  if (!Array.isArray(kpis) || kpis.length === 0) return '';
  return kpis.map((kpi) => renderKpiCard(kpi.label, kpi.value)).join('');
}

/**
 * Renders a single process list item for the Operação tab.  The card
 * includes the company name, current stage or status, the triage
 * status and some basic metadata.  Data attributes are added for
 * event delegation.  All dynamic text is escaped.
 *
 * @param {any} p Process object returned by the API
 * @returns {string}
 */
export function renderProcessRow(p) {
  const idStr = h(String(p?.id ?? ''));
  const company = h(p?.company || 'Empresa');
  const stageOrStatus = h(p?.stage || p?.status || '—');
  const triageLabel = h(formatTriage(p?.triage?.status));
  const city = h(p?.city || '—');
  const sector = h(p?.sector || '—');
  return `<div class="process-item" data-action="admin-open-process" data-id="${idStr}" role="listitem" tabindex="0"><div class="process-top"><span class="process-name">${company}</span><span class="meta-chip">${stageOrStatus}</span><span class="meta-chip">${triageLabel}</span></div><div class="process-meta">${city} • ${sector}</div></div>`;
}

/**
 * Renders a list of processes for the Operação tab.  This helper
 * simply maps each process through {@link renderProcessRow}.  When
 * provided with an empty or falsy array it returns an empty string.
 *
 * @param {any[]} processes
 * @returns {string}
 */
export function renderList(processes) {
  if (!Array.isArray(processes) || processes.length === 0) return '';
  return processes.map((p) => renderProcessRow(p)).join('');
}

/**
 * Renders the detail view for a process in the Operação tab.  The
 * detail includes a header, meta information, triage controls,
 * assignment controls and a timeline placeholder.  A close button
 * terminates the section.  Values are escaped and all inputs are
 * prepopulated based on the process data.
 *
 * @param {any} p The process returned from the API
 * @returns {string}
 */
export function renderProcessDetail(p) {
  // Header and metadata
  const headerHtml = renderDetailHeader(p?.company || p?.id || 'Processo', `Etapa: ${p?.stage || '—'} • Status: ${p?.status || '—'}`);
  const metaHtml = renderDetailMeta([
    { label: 'Cidade', value: p?.city || '—' },
    { label: 'Setor', value: p?.sector || '—' },
    { label: 'Submetido em', value: p?.submittedAt ? formatDateBr(p?.submittedAt) : '—' },
    { label: 'Prazo final', value: p?.dueAt ? formatDateBr(p?.dueAt) : '—' },
  ]);
  // Triage controls
  const pid = p?.id || '';
  const triageButtons = [
    renderButton('Triagem OK', { action: 'admin-triage-ok', id: pid, className: 'btn btn-secondary btn-small' }),
    renderButton('Solicitar complemento', { action: 'admin-triage-needs-fixes', id: pid, className: 'btn btn-secondary btn-small' }),
  ];
  const triageActions = renderActionsRow(triageButtons);
  const triageHtml = `<section class="detail-triage"><h3>Triagem formal</h3>${renderMetaRow('Status atual', formatTriage(p?.triage?.status))}<label for="admin-triage-notes">Notas</label><textarea id="admin-triage-notes" rows="3">${h(p?.triage?.notes || '')}</textarea>${triageActions}${renderMutedParagraph('Triagem de admissibilidade: verifica completude, legibilidade e higienização dos dados, sem julgar mérito. Pendências formais serão comunicadas ao participante (prazo típico de 5 dias úteis para correção).')}</section>`;
  // Assignment controls
  const assignButtons = [
    renderButton('Salvar', { action: 'admin-assign', id: pid, className: 'btn btn-secondary btn-small' }),
    renderButton('Limpar', { action: 'admin-unassign', id: pid, className: 'btn btn-secondary btn-small' }),
  ];
  const assignActions = renderActionsRow(assignButtons);
  const assignHtml = `<section class="detail-assignment"><h3>Designação de avaliadores</h3><label for="admin-assign-principal">Avaliador Principal (e-mail)</label><input type="email" id="admin-assign-principal" value="${h(p?.assignment?.principalEmail || '')}"><label for="admin-assign-reviewer">Avaliador Revisor (e-mail)</label><input type="email" id="admin-assign-reviewer" value="${h(p?.assignment?.reviewerEmail || '')}">${assignActions}${renderMutedParagraph('Ao salvar, o processo segue para análise conforme o fluxo do backend.')}</section>`;
  // Timeline placeholder with hint
  const timelineHtml = `<section class="detail-log"><h3>Log recente</h3><ul class="audit-list"><li class="muted">Carregando…</li></ul><p class="muted">O log é alimentado pelo backend. Se estiver vazio hoje, o conector está sendo ativado gradativamente.</p></section>`;
  // Close button
  const closeHtml = `<button type="button" class="btn btn-link btn-small" data-action="admin-close-detail">Fechar</button>`;
  return headerHtml + metaHtml + triageHtml + assignHtml + timelineHtml + closeHtml;
}

/**
 * Renders the detail view for a process in the NCS tab.  This view
 * shows technical recommendations from principal and reviewer, action
 * buttons for the NCS and a timeline placeholder.  All dynamic
 * values are escaped.
 *
 * @param {any} p Process returned from the API
 * @returns {string}
 */
export function renderNcsProcessDetail(p) {
  // Header and meta shared with operation view
  const headerHtml = renderDetailHeader(p?.company || p?.id || 'Processo', `Etapa: ${p?.stage || '—'} • Status: ${p?.status || '—'}`);
  const metaHtml = renderDetailMeta([
    { label: 'Cidade', value: p?.city || '—' },
    { label: 'Setor', value: p?.sector || '—' },
    { label: 'Submetido em', value: p?.submittedAt ? formatDateBr(p?.submittedAt) : '—' },
    { label: 'Prazo final', value: p?.dueAt ? formatDateBr(p?.dueAt) : '—' },
  ]);
  // Technical summary
  const principalRec = p?.reviews?.principal;
  const revisorRec = p?.reviews?.revisor;
  const principalLine = principalRec?.submittedAt
    ? `<p><strong>Avaliador Principal:</strong> ${h(principalRec?.recommendation || '—')}</p>`
    : '<p><strong>Avaliador Principal:</strong> —</p>';
  const principalComment = principalRec?.comment
    ? `<p class="muted">${h(principalRec.comment)}</p>`
    : '';
  const revisorLine = revisorRec?.submittedAt
    ? `<p><strong>Avaliador Revisor:</strong> ${h(revisorRec?.recommendation || '—')}</p>`
    : '<p><strong>Avaliador Revisor:</strong> —</p>';
  const revisorComment = revisorRec?.comment
    ? `<p class="muted">${h(revisorRec.comment)}</p>`
    : '';
  const summaryHtml =
    '<section class="detail-summary"><h3>Resumo técnico</h3>' +
    principalLine +
    principalComment +
    revisorLine +
    revisorComment +
    '<p class="muted">Deferência técnica: a NCS tende a adotar as recomendações dos avaliadores. Quando há divergência relevante, pode ser solicitado alinhamento técnico antes da deliberação final.</p>' +
    '</section>';
  // Action buttons
  const pidStr = String(p?.id || '');
  const actionsButtons = [
    renderButton('Registrar decisão', { action: 'admin-ncs-decide', id: pidStr, className: 'btn btn-primary btn-small' }),
    renderButton('Solicitar alinhamento', { action: 'admin-ncs-align', id: pidStr, className: 'btn btn-secondary btn-small' }),
    renderButton('Devolver à Operação', { action: 'admin-ncs-return', id: pidStr, className: 'btn btn-secondary btn-small' }),
  ];
  const actionsHtml = renderActionsRow(actionsButtons);
  // Timeline placeholder (without hint for NCS)
  const timelineHtml = `<section class="detail-log"><h3>Log recente</h3><ul class="audit-list"><li class="muted">Carregando…</li></ul></section>`;
  const closeHtml = `<button type="button" class="btn btn-link btn-small" data-action="admin-ncs-close-detail">Fechar</button>`;
  return headerHtml + metaHtml + summaryHtml + actionsHtml + timelineHtml + closeHtml;
}

/**
 * Builds the markup for an audit log list.  The entries array
 * corresponds to the objects returned by the backend.  When empty
 * the helper returns a single placeholder list item.  Timestamps are
 * converted to the locale date and time for Brazil.  Unknown values
 * produce a dash.
 *
 * @param {any[]} entries
 * @returns {string}
 */
export function renderAuditLog(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<li class="muted">Sem registros por enquanto.</li>';
  }
  return entries.slice(0, 8).map((entry) => {
    const ts = entry?.created_at || entry?.ts || entry?.time || null;
    let label = String(entry?.event || entry?.type || entry?.action || 'evento');
    // Format timestamp using Brazilian locale; fallback to raw value
    let dt;
    try {
      const d = ts ? new Date(ts) : null;
      if (d && !Number.isNaN(d.getTime())) {
        const date = d.toLocaleDateString('pt-BR');
        const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        dt = `${date} ${time}`;
      } else {
        dt = ts ? String(ts) : '—';
      }
    } catch {
      dt = ts ? String(ts) : '—';
    }
    return `<li>${h(dt)}: ${h(label)}</li>`;
  }).join('');
}