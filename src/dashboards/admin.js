/**
 * @file src/dashboards/admin.js
 * @module dashboards/admin
 * @description Dashboard do gestor (admin). Render + ações de Operação e Decisão NCS.
 * Sessão cookie-first (HttpOnly). Sem localStorage.
 */

import * as app from '../state.js';
import * as api from '../services/api.js';
import * as audit from '../audit.js';
// Import core UI helpers from the shared dashboard module. These helpers are
// re-exported from the core UI module to ensure a single canonical source.
import { $id, clearEl, setText, escapeHtml, formatDateBr } from './shared.js';
// Import additional UI helpers directly from the core shared module.  These
// functions provide shorter aliases for escaping and a helper for building
// safe attributes.  They are not re-exported via ./shared.js yet.
import { h, attr, safeUrl } from '../shared/ui.js';
// Import UI blocks for reusable markup (chips, meta rows, KPI cards)
// Import blocks helpers. Additional helpers (renderCard, renderMetaTable,
// renderKpiRow, renderEmptyState) are available for reuse in the dashboard.
import {
  renderMetaRow,
  renderChip,
  renderKpiCard,
  renderCard,
  renderMetaTable,
  renderKpiRow,
  renderEmptyState,
} from '../shared/blocks.js';

// Import pure renderers extracted into a separate module.  These
// functions produce HTML strings without interacting with the DOM.
import {
  renderKpis as renderAdminKpisPure,
  renderList as renderAdminListHtml,
  renderProcessDetail as renderAdminProcessDetailHtmlPure,
  renderNcsProcessDetail as renderAdminNcsProcessDetailHtmlPure,
  renderAuditLog as renderAdminAuditLogHtml,
  // renderProcessRowPure and formatTriagePure were extracted to the renderer
  // module but are not used directly in this orchestrator.  They remain
  // available for import if needed in the future.
} from './admin_renderers.js';

// Import action installer for the admin dashboard.  This module
// encapsulates event binding and mutation handlers.
import { installAdminActions } from './admin_actions.js';

// Import centralised DOM helpers for the admin dashboard.  These
// functions avoid sprinkling getElementById throughout the file.
import { get as domGet, qs as domQs, qsa as domQsa, dom as adminDom } from './admin_dom.js';

/* ==========================================================================
  Constantes + estado
============================================================================ */

const DISPARITY_THRESHOLD_PP = 20;

// Os detalhes são sempre renderizados via templates HTML usando `innerHTML`.
// A antiga implementação imperativa (createElement/appendChild) foi removida para simplificar
// e reduzir a complexidade do código.

// -----------------------------------------------------------------------------
// As listas do painel do gestor sempre são renderizadas via template strings e `innerHTML`.
// O caminho imperativo antigo foi removido para reduzir verbosidade e tamanho do arquivo.

/**
 * Número padrão de itens retornados pela API. O painel do gestor precisa
 * carregar todos os processos de maneira robusta; limitamos a 200 por
 * padrão e permitimos ampliar via botão "Carregar mais".
 */
const DEFAULT_ADMIN_LIST_LIMIT = 200;
/**
 * Limite atual de processos a buscar na API. É incrementado pela ação
 * admin-load-more. Reiniciado ao valor padrão quando o painel é
 * recarregado.
 */
let adminListLimit = DEFAULT_ADMIN_LIST_LIMIT;

/** Cache de processos para evitar refetch em filtros/tabs (UX mais fluida). */
let _adminProcessesCache = /** @type {any[]|null} */ (null);
let _adminCacheFetchedAt = 0;

/**
 * Recupera o elemento announcer do painel do gestor. Este elemento
 * fica oculto visualmente (sr-only) e é usado para anunciar mensagens
 * de carregamento e erro via leitor de tela, garantindo acessibilidade.
 * @returns {HTMLElement|null}
 */
function getAdminAnnouncer() {
  return document.getElementById('admin-dashboard-announcer');
}

/**
 * Anuncia uma mensagem para o painel do gestor. Quando não há mensagem
 * (string vazia ou undefined), o conteúdo é limpo. Se o elemento não
 * existir, nada acontece. Utilize para informar estados de loading
 * ou falhas, seguindo o padrão dos dashboards do participante e do
 * avaliador.
 * @param {string} message
 */
function announceAdmin(message) {
  const el = getAdminAnnouncer();
  if (!el) return;
  el.textContent = String(message || '');
}

function setLoading(el, message = 'Carregando…') {
  if (!el) return;
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'loading muted';
  p.textContent = message;
  el.appendChild(p);
}

function setError(el, message) {
  if (!el) return;
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = String(message || 'Não foi possível carregar agora.');
  el.appendChild(p);
}

function setEmptyState(el, title, body) {
  if (!el) return;
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.innerHTML = `<strong>${escapeHtml(title || 'Sem itens.')}</strong>${body ? `<br><span class="muted">${escapeHtml(body)}</span>` : ''}`;
  el.appendChild(p);
}

// escapeHtml is now imported from './shared.js'

async function getAdminProcessesFresh() {
  const listFn = api?.listProcesses;
  if (typeof listFn !== 'function') throw new Error('API indisponível: listProcesses');
  const processes = await listFn({ limit: adminListLimit });
  _adminProcessesCache = Array.isArray(processes) ? processes : [];
  _adminCacheFetchedAt = Date.now();
  return _adminProcessesCache;
}
let _adminBooted = false;
// _adminEventsBound removed – event delegation is now handled by admin_actions.js
/** @type {string|null} */
let currentProcessId = null;
/** @type {'operacao'|'ncs'} */
let _adminCurrentTab = 'operacao';
// removed local inflight tracking – handled by admin_actions.js

/* ==========================================================================
  Init
============================================================================ */

export async function initAdminDashboard() {
  if (!_adminBooted) _adminBooted = true;
  // Reinicia o limite de listagem sempre que o painel é iniciado. Isso evita
  // que o limite aumentado em execuções anteriores persista após navegar
  // entre vistas.
  adminListLimit = DEFAULT_ADMIN_LIST_LIMIT;
  // Instala a delegação de ações e listeners de eventos.  Esta
  // chamada só executa bindings na primeira execução e passa
  // callbacks para o módulo de actions.  O módulo de actions
  // encapsula dispatchers e handlers de mutações.
  installAdminActions({
    switchAdminTab: switchAdminTab,
    openAdminProcessDetail: openAdminProcessDetail,
    closeAdminProcessDetail: closeAdminProcessDetail,
    refreshAdminDashboard: refreshAdminDashboard,
    loadMoreAdminProcesses: loadMoreAdminProcesses,
    notifyAdmin: notifyAdmin,
    renderAdminProcessDetail: (pid) => renderAdminProcessDetail(pid),
    renderAdminNcsProcessDetail: (pid) => renderAdminNcsProcessDetail(pid),
  });

  // Acessibilidade: anuncia carregamento do painel
  announceAdmin('Carregando painel do gestor…');

  const kpiGrid = document.getElementById('admin-kpi-grid');
  const listEl = document.getElementById('admin-process-list');
  const ncsListEl = document.getElementById('admin-ncs-process-list');

  setLoading(kpiGrid, 'Carregando…');
  setLoading(listEl, 'Carregando…');
  setLoading(ncsListEl, 'Carregando…');

  try {
    await refreshAdminDashboard();
    // Limpa o announcer após sucesso
    announceAdmin('');
  } catch {
    // Erro já tratado em refreshAdminDashboard, mas garante fallback
    announceAdmin('Falha ao carregar dados do painel do gestor. Tente novamente mais tarde.');
  }
}

export async function refreshAdminDashboard() {
  try {
    const listFn = api?.listProcesses;
    if (typeof listFn !== 'function') throw new Error('API indisponível: listProcesses');

    // Busca com limite atual para garantir que todos os processos fiquem visíveis.
    const processes = await listFn({ limit: adminListLimit });
    _adminProcessesCache = Array.isArray(processes) ? processes : [];
    _adminCacheFetchedAt = Date.now();

    await renderAdminKpis(processes);
    await renderAdminList(processes);
    await renderAdminNcsList(processes);

    // Atualiza callouts: limite e permissão
    try {
      const limitCallout = document.getElementById('admin-limit-callout');
      const countSpan = document.getElementById('admin-limit-count');
      if (limitCallout && countSpan) {
        countSpan.textContent = String(adminListLimit);
        // mostra callout apenas se a quantidade carregada for maior ou igual ao limite
        if (Array.isArray(processes) && processes.length >= adminListLimit) {
          limitCallout.hidden = false;
        } else {
          limitCallout.hidden = true;
        }
      }
      const permCallout = document.getElementById('admin-permission-callout');
      if (permCallout) {
        if (Array.isArray(processes) && processes.length === 0) {
          permCallout.hidden = false;
        } else {
          permCallout.hidden = true;
        }
      }
    } catch {
      /* noop: callouts são opcionais */
    }

    syncAdminTabUi();
    // limpar announcer quando dados são carregados com sucesso
    announceAdmin('');
  } catch (err) {
    const kpiGrid = document.getElementById('admin-kpi-grid');
    const listEl = document.getElementById('admin-process-list');
    const ncsListEl = document.getElementById('admin-ncs-process-list');
    setError(kpiGrid, 'Não foi possível carregar agora. Tente novamente em instantes.');
    setError(listEl, 'Não foi possível carregar agora. Tente novamente em instantes.');
    setError(ncsListEl, 'Não foi possível carregar agora. Tente novamente em instantes.');
    notifyAdmin('Falha ao carregar processos.', 'warn');
    console.warn('[admin] refresh falhou:', err);
    // anuncia falha para leitores de tela
    announceAdmin('Falha ao carregar dados do painel do gestor. Verifique sua conexão e tente novamente.');
  }
}

/* ==========================================================================
  Tabs
============================================================================ */

export function switchAdminTab(target) {
  const next = target === 'ncs' ? 'ncs' : 'operacao';
  if (_adminCurrentTab === next) return;
  _adminCurrentTab = next;
  syncAdminTabUi();

  // Re-render leve por aba (sem travar UX)
  if (next === 'ncs') void renderAdminNcsList().catch(() => {});
  else void renderAdminList().catch(() => {});
}

function syncAdminTabUi() {
  const opBtn = document.getElementById('admin-mode-operacao');
  const ncsBtn = document.getElementById('admin-mode-ncs');
  const opPanel = document.getElementById('admin-panel-operacao');
  const ncsPanel = document.getElementById('admin-panel-ncs');

  if (opBtn) {
    const isActive = _adminCurrentTab === 'operacao';
    opBtn.classList.toggle('active', isActive);
    opBtn.setAttribute('aria-selected', String(isActive));
    opBtn.setAttribute('tabindex', isActive ? '0' : '-1');
  }

  if (ncsBtn) {
    const isActive = _adminCurrentTab === 'ncs';
    ncsBtn.classList.toggle('active', isActive);
    ncsBtn.setAttribute('aria-selected', String(isActive));
    ncsBtn.setAttribute('tabindex', isActive ? '0' : '-1');
  }

  if (opPanel) opPanel.hidden = _adminCurrentTab !== 'operacao';
  if (ncsPanel) ncsPanel.hidden = _adminCurrentTab !== 'ncs';
}

/* ==========================================================================
  Render — NCS list + detail
============================================================================ */

export async function renderAdminNcsList(processes = null) {
  const listEl = document.getElementById('admin-ncs-process-list');
  const emptyEl = document.getElementById('admin-ncs-empty');
  if (!listEl) return;

  setLoading(listEl, 'Carregando…');
  if (emptyEl) emptyEl.hidden = true;

  try {
    let procs = Array.isArray(processes)
      ? processes.slice()
      : Array.isArray(_adminProcessesCache)
        ? _adminProcessesCache.slice()
        : (await getAdminProcessesFresh()).slice();

    procs = procs.filter((p) => {
      const st = String(p?.stage || '').trim();
      return st === 'Aguardando decisão NCS' || st === 'Em divergência';
    });

    procs.sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.submittedAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.submittedAt || 0).getTime();
      return tb - ta;
    });

    listEl.innerHTML = '';

    if (!procs.length) {
      if (emptyEl) emptyEl.hidden = false;
      setEmptyState(listEl, 'Sem casos aguardando decisão.', 'Quando houver processos em decisão, eles aparecerão aqui.');
      return;
    }

    // render list using template strings
    {
      const itemsHtml = procs.map((p) => {
        // determine disparity status
        let disparity = false;
        const reviews = p?.reviews;
        if (reviews) {
          const recP = reviews.principal?.recommendation || null;
          const recR = reviews.revisor?.recommendation || null;
          if (recP && recR && recP !== recR) {
            disparity = true;
          }
          if (!disparity && typeof p.scorePrincipal === 'number' && typeof p.scoreRevisor === 'number') {
            const diff = Math.abs(p.scorePrincipal - p.scoreRevisor);
            if (diff > DISPARITY_THRESHOLD_PP) disparity = true;
          }
        }
        // Utiliza helper de chip compartilhado para sinalizar divergência quando aplicável
        const disparityChip = disparity ? renderChip('Divergência', 'warn') : '';
        return `<div class="process-item" data-action="admin-ncs-open-process" data-id="${escapeHtml(String(p.id || ''))}" role="listitem" tabindex="0"><div class="process-top"><span class="process-name">${escapeHtml(p.company || 'Empresa')}</span><span class="meta-chip">${escapeHtml(p.stage || '—')}</span><span class="meta-chip">${escapeHtml(formatDateBr(p?.dueAt))}</span>${disparityChip}</div><div class="process-meta">${escapeHtml(p.city || '—')} • ${escapeHtml(p.sector || '—')}</div></div>`;
      }).join('');
      listEl.innerHTML = itemsHtml;
    }
  } catch (err) {
    setError(listEl, 'Erro ao carregar a fila de decisão. Tente novamente em instantes.');
    console.warn('[admin] ncs list falhou:', err);
  }
}

export async function renderAdminNcsProcessDetail(processId) {
  currentProcessId = processId || null;

  const section = document.getElementById('admin-ncs-process-detail-section');
  const container = document.getElementById('admin-ncs-process-detail');
  if (!container || !section) return;

  section.hidden = false;
  container.innerHTML = '';

  try {
    const getFn = api?.getProcessById;
    if (typeof getFn !== 'function') throw new Error('API indisponível: getProcessById');

    const p = await getFn(processId);
    if (!p) {
      container.textContent = 'Processo não encontrado.';
      return;
    }

    // Renderiza o detalhe sempre via template string utilizando renderer puro
    container.innerHTML = renderAdminNcsProcessDetailHtmlPure(p);
    const logList = /** @type {HTMLElement|null} */ (container.querySelector('.audit-list'));
    if (logList) {
      // Indica carregamento enquanto busca o log no backend.
      logList.innerHTML = '<li class="muted">Carregando…</li>';
      await renderAdminAuditLogIntoList(String(p.id), logList);
    }
    return;
  } catch (err) {
    setError(container, 'Não foi possível abrir o detalhe agora. Tente novamente em instantes.');
    console.warn('[admin] ncs detail falhou:', err);
  }
}

export function closeAdminNcsDetail() {
  const section = document.getElementById('admin-ncs-process-detail-section');
  if (section) section.hidden = true;
}

/* ==========================================================================
  API público extra — funções utilitárias
============================================================================ */

/**
 * Incrementa o limite de processos e força um recarregamento do painel.
 * Exposto para ser chamado pelo dispatcher central (actions.js). O valor
 * incrementado é 100 por chamada. O callout será atualizado após o refresh.
 */
export function loadMoreAdminProcesses() {
  adminListLimit += 100;
  return refreshAdminDashboard();
}

/* ==========================================================================
  Render — KPIs + lista Operação
============================================================================ */

export async function renderAdminKpis(processes = null) {
  const el = document.getElementById('admin-kpi-grid');
  if (!el) return;
  // zera conteúdo antes de renderizar
  el.innerHTML = '';

  try {
    const procs = Array.isArray(processes)
      ? processes
      : Array.isArray(_adminProcessesCache)
        ? _adminProcessesCache
        : await getAdminProcessesFresh();

    const now = new Date();
    let submetidos = 0;
    let triagem = 0;
    let aguardando = 0;
    let emAnalise = 0;
    let atrasados = 0;

    procs.forEach((p) => {
      if (!p) return;

      const st = String(p.stage || '').trim();
      if (st.toLowerCase().includes('submetido')) submetidos += 1;
      else if (st === 'Triagem') triagem += 1;
      else if (st === 'Aguardando designação') aguardando += 1;
      else if (st === 'Em análise' || st.toLowerCase().includes('analise')) emAnalise += 1;
      else submetidos += 1;

      const dueMs = safeTime(p.dueAt);
      if (dueMs && dueMs < now.getTime()) atrasados += 1;
    });

    const items = [
      { label: 'Submetidos', value: submetidos },
      { label: 'Triagem', value: triagem },
      { label: 'Aguardando designação', value: aguardando },
      { label: 'Em análise', value: emAnalise },
      { label: 'Atrasados', value: atrasados },
    ];

    // Atualiza meta-chips no cabeçalho (total, triagem e em análise)
    try {
      const metaTotal = document.getElementById('admin-meta-total');
      if (metaTotal) metaTotal.textContent = String(procs.length);
      const metaTriagem = document.getElementById('admin-meta-triagem');
      if (metaTriagem) metaTriagem.textContent = String(triagem);
      const metaAnalise = document.getElementById('admin-meta-analise');
      if (metaAnalise) metaAnalise.textContent = String(emAnalise);
    } catch {
      /* meta-chips são opcionais */
    }

    // Renderiza os indicadores usando os renderizadores puros extraídos.
    // A função auxiliar retorna a marcação de todas as KPIs como string segura.
    el.innerHTML = renderAdminKpisPure(items);
  } catch (err) {
    // Em caso de erro, exibe estado vazio simples via innerHTML.
    el.innerHTML =
      '<p class="error">Indicadores indisponíveis no momento. Integrações são ativadas gradativamente.</p>';
    console.warn('[admin] kpis falharam:', err);
  }
}

/**
 * Gera a marcação HTML para o grid de KPIs.
 * Produz um fragmento contendo cartões (.kpi-card) com valor e rótulo escapados.
 * @param {{ label: string, value: number }[]} kpis
 * @returns {string}
 */
// Note: the HTML generator for KPIs has been moved to
// src/dashboards/admin_renderers.js.  The function above remains
// unused in this module.

function getAdminFilters() {
  const stageSelect = document.getElementById('admin-filter-stage');
  const searchInput = document.getElementById('admin-filter-search');

  const stage = stageSelect ? String(stageSelect.value || '') : '';
  const search = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';

  return { stage, search };
}

export function clearAdminFilters() {
  const stageSelect = document.getElementById('admin-filter-stage');
  const searchInput = document.getElementById('admin-filter-search');

  if (stageSelect) stageSelect.value = '';
  if (searchInput) searchInput.value = '';

  void renderAdminList().catch(() => {});
}

export async function renderAdminList(processes = null) {
  const listEl = document.getElementById('admin-process-list');
  if (!listEl) return;

  setLoading(listEl, 'Carregando…');

  try {
    let procs = Array.isArray(processes)
      ? processes.slice()
      : Array.isArray(_adminProcessesCache)
        ? _adminProcessesCache.slice()
        : (await getAdminProcessesFresh()).slice();
    const { stage, search } = getAdminFilters();

    procs.sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.submittedAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.submittedAt || 0).getTime();
      return tb - ta;
    });

    procs = procs.filter((p) => {
      if (!p) return false;

      if (stage) {
        const st = String(p.stage || '').trim();
        if (st !== stage) return false;
      }

      if (search) {
        const comp = String(p.company || '').toLowerCase();
        const city = String(p.city || '').toLowerCase();
        const sector = String(p.sector || '').toLowerCase();
        if (!comp.includes(search) && !city.includes(search) && !sector.includes(search)) return false;
      }

      return true;
    });

    listEl.innerHTML = '';

    if (!procs.length) {
      // Use the shared empty state renderer when no processes match the filters.
      listEl.innerHTML = renderEmptyState(
        'Nenhum processo encontrado.',
        'A lista reflete filtros e o estado atual do backend.'
      );
      return;
    }

    {
      // Delegate to the pure renderer to build each list item.  The
      // renderer is imported from admin_renderers and produces
      // deterministic markup without DOM side effects.
      const itemsHtml = renderAdminListHtml(procs);
      listEl.innerHTML = itemsHtml;
    }
  } catch (err) {
    setError(listEl, 'Erro ao carregar lista de processos. Tente novamente em instantes.');
    console.warn('[admin] list falhou:', err);
  }
}

/* ==========================================================================
  Render — Detalhe Operação
============================================================================ */

export async function renderAdminProcessDetail(processId) {
  currentProcessId = processId || null;

  const section = document.getElementById('admin-process-detail-section');
  const container = document.getElementById('admin-process-detail');
  if (!container || !section) return;

  section.hidden = false;
  container.innerHTML = '';

  try {
    const getFn = api?.getProcessById;
    if (typeof getFn !== 'function') throw new Error('API indisponível: getProcessById');

    const p = await getFn(processId);
    if (!p) {
      container.textContent = 'Processo não encontrado.';
      return;
    }

    // Renderiza o detalhe via template string utilizando renderer puro
    container.innerHTML = renderAdminProcessDetailHtmlPure(p);
    // Após inserir o HTML, carrega o log recente de forma assíncrona
    const logList = /** @type {HTMLElement|null} */ (container.querySelector('.audit-list'));
    if (logList) {
      logList.innerHTML = '<li class="muted">Carregando…</li>';
      await renderAdminAuditLogIntoList(String(p.id), logList);
    }
  } catch (err) {
    setError(container, 'Não foi possível abrir o detalhe agora. Tente novamente em instantes.');
    console.warn('[admin] detail falhou:', err);
  }
}

/* ==========================================================================
  Triagem e decisão — formulários customizados
============================================================================ */

/**
 * Preenche o formulário de triagem para o processo selecionado e exibe-o.
 * Existem duas versões do formulário, uma para a aba Operação (sufixo -op)
 * e outra para a aba Decisão NCS (sufixo -ncs). Este helper detecta a
 * aba atual (_adminCurrentTab) e atualiza os elementos correspondentes.
 *
 * O backend aceita campos arbitrários para triagem; aqui mapeamos o
 * status retornado para as opções do select. Caso o processo tenha
 * valores inesperados, o campo ficará em branco para forçar seleção
 * consciente pelo gestor.
 *
 * @param {any} process
 */
export function renderAdminProcessTriageForm(process) {
  try {
    if (!process || typeof process !== 'object') return;
    const suffix = _adminCurrentTab === 'ncs' ? 'ncs' : 'op';
    const section = document.getElementById(`admin-triage-form-${suffix}`);
    if (!section) return;
    // Mostrar o formulário
    section.hidden = false;

    // Status
    const statusEl = /** @type {HTMLSelectElement|null} */ (section.querySelector(`#admin-triage-status-${suffix}`));
    const triage = process.triage || {};
    let statusVal = '';
    const rawStatus = String(triage.status || '').toLowerCase();
    // Mapear status existentes (OK/ne ou outros) para rótulos amigáveis
    if (rawStatus === 'ok' || rawStatus === 'apto' || rawStatus === 'ready') statusVal = 'apto';
    else if (rawStatus && rawStatus !== 'ok' && rawStatus !== 'ready') statusVal = 'pendente_complemento';
    if (statusEl) {
      statusEl.value = statusVal;
    }

    // Flags
    const flagsEl = /** @type {HTMLInputElement|null} */ (section.querySelector(`#admin-triage-flags-${suffix}`));
    if (flagsEl) flagsEl.value = triage.flags || '';

    // Notes
    const notesEl = /** @type {HTMLTextAreaElement|null} */ (section.querySelector(`#admin-triage-notes-${suffix}`));
    if (notesEl) notesEl.value = triage.notes || '';

    // Define data-id no botão de salvar
    const btn = /** @type {HTMLElement|null} */ (section.querySelector('[data-action="admin-update-triage"]'));
    if (btn) btn.dataset.id = String(process.id || '');

    // Resultado/feedback
    const resultEl = section.querySelector(`#admin-triage-result-${suffix}`);
    if (resultEl) resultEl.textContent = '';
  } catch {
    /* noop */
  }
}

/**
 * Preenche o formulário de decisão final e exibe-o.
 * Assim como no formulário de triagem, há versões para ambas as abas
 * (sufixos -op e -ncs). O objeto `process.decision` pode ter campos
 * variados (status/outcome, reason/rationale). Fazemos uma busca
 * best‑effort pelos campos mais prováveis.
 *
 * @param {any} process
 */
export function renderAdminDecisionForm(process) {
  try {
    if (!process || typeof process !== 'object') return;
    const suffix = _adminCurrentTab === 'ncs' ? 'ncs' : 'op';
    const section = document.getElementById(`admin-decision-form-${suffix}`);
    if (!section) return;
    section.hidden = false;

    const decision = process.decision || {};
    // status (outcome)
    const statusEl = /** @type {HTMLSelectElement|null} */ (section.querySelector(`#admin-decision-status-${suffix}`));
    if (statusEl) {
      const raw = String(decision.status || decision.outcome || '').toLowerCase();
      let val = '';
      if (raw === 'validado' || raw === 'valid' || raw === 'aprovado') val = 'validado';
      else if (raw === 'validado_condicionado' || raw === 'aprovado_condicionado' || raw === 'valid_condicional') val = 'validado_condicionado';
      else if (raw === 'reprovado' || raw === 'rejected') val = 'reprovado';
      statusEl.value = val;
    }
    // reason
    const reasonEl = /** @type {HTMLTextAreaElement|null} */ (section.querySelector(`#admin-decision-reason-${suffix}`));
    if (reasonEl) reasonEl.value = decision.reason || decision.rationale || '';
    // score
    const scoreEl = /** @type {HTMLInputElement|null} */ (section.querySelector(`#admin-decision-score-${suffix}`));
    if (scoreEl) {
      const scoreRaw = decision.score;
      scoreEl.value = scoreRaw != null ? String(scoreRaw) : '';
    }
    // Botões de ação (decision/align/return)
    const decideBtn = /** @type {HTMLElement|null} */ (section.querySelector('[data-action="admin-ncs-decide"]'));
    const alignBtn = /** @type {HTMLElement|null} */ (section.querySelector('[data-action="admin-ncs-align"]'));
    const returnBtn = /** @type {HTMLElement|null} */ (section.querySelector('[data-action="admin-ncs-return"]'));
    const pid = String(process.id || '');
    if (decideBtn) decideBtn.dataset.id = pid;
    if (alignBtn) alignBtn.dataset.id = pid;
    if (returnBtn) returnBtn.dataset.id = pid;
    // Resultado/feedback
    const resultEl = section.querySelector(`#admin-decision-result-${suffix}`);
    if (resultEl) resultEl.textContent = '';
  } catch {
    /* noop */
  }
}

/**
 * Abre o detalhe de processo e preenche os formulários de triagem e decisão.
 * Detecta a aba corrente (operacao/ncs) para determinar qual painel de
 * detalhe deve ser exibido. Utiliza as funções de renderização
 * existentes para montar o corpo do detalhe e, em seguida,
 * complementa com os formulários adicionais.
 *
 * @param {string} processId
 */
export async function openAdminProcessDetail(processId) {
  const pid = String(processId || '').trim();
  if (!pid) return;
  try {
    const getFn = api?.getProcessById;
    if (typeof getFn !== 'function') throw new Error('API indisponível: getProcessById');
    // Render detalhe base conforme a aba
    if (_adminCurrentTab === 'ncs') {
      await renderAdminNcsProcessDetail(pid);
    } else {
      await renderAdminProcessDetail(pid);
    }
    const process = await getFn(pid);
    renderAdminProcessTriageForm(process);
    renderAdminDecisionForm(process);
    currentProcessId = pid;
  } catch (err) {
    console.warn('[admin] openAdminProcessDetail falhou:', err);
    notifyAdmin('Não foi possível abrir detalhe agora.', 'warn');
  }
}

/**
 * Fecha o painel de detalhe (tanto Operação quanto NCS) e esconde os
 * formulários de triagem/decisão. Utilizado por ações de cancelar/fechar.
 */
export function closeAdminProcessDetail() {
  try {
    const opSection = document.getElementById('admin-process-detail-section');
    if (opSection) opSection.hidden = true;
    const ncsSection = document.getElementById('admin-ncs-process-detail-section');
    if (ncsSection) ncsSection.hidden = true;
    // Esconder formulários
    const triageOp = document.getElementById('admin-triage-form-op');
    const triageNcs = document.getElementById('admin-triage-form-ncs');
    const decisionOp = document.getElementById('admin-decision-form-op');
    const decisionNcs = document.getElementById('admin-decision-form-ncs');
    if (triageOp) triageOp.hidden = true;
    if (triageNcs) triageNcs.hidden = true;
    if (decisionOp) decisionOp.hidden = true;
    if (decisionNcs) decisionNcs.hidden = true;
    currentProcessId = null;
  } catch {
    /* noop */
  }
}
export function closeAdminDetail() {
  const section = document.getElementById('admin-process-detail-section');
  if (section) section.hidden = true;
}

/* ==========================================================================
  Actions — Operação
============================================================================ */

/* performAdminTriage moved to admin_actions.js */

/* performAdminAssign moved to admin_actions.js */

/* performAdminUnassign moved to admin_actions.js */

/* ==========================================================================
  Actions — NCS
============================================================================ */

/* performNcsDecision moved to admin_actions.js */

/* ==========================================================================
  Events (self-contained, defensive)
============================================================================ */

/* Event delegation and dispatch logic moved to admin_actions.js */

/* ==========================================================================
  Audit log render
============================================================================ */

async function renderAdminAuditLogIntoList(processId, ul) {
  if (!ul) return;

  const fn = api?.getAuditLog;
  if (typeof fn !== 'function') {
    ul.innerHTML = '<li class="muted">Log indisponível nesta versão.</li>';
    return;
  }

  try {
    const entries = await fn(processId, { limit: 8 });
    ul.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      ul.innerHTML = '<li class="muted">Sem registros por enquanto.</li>';
      return;
    }

    // Use the pure renderer extracted into admin_renderers to
    // generate the markup for the audit list.  The renderer handles
    // timestamp formatting and escaping.
    const markup = renderAdminAuditLogHtml(entries);
    ul.innerHTML = markup;
  } catch (err) {
    ul.innerHTML = '<li class="muted">Não foi possível carregar o log agora.</li>';
    console.warn('[admin] audit log falhou:', err);
  }
}

/* ==========================================================================
  Dialog — decisão NCS
============================================================================ */

/* NCS decision dialog moved to admin_actions.js */

/* ==========================================================================
  Utils
============================================================================ */

/* withInflight helper moved to admin_actions.js */

function notifyAdmin(message, tone = 'info') {
  const host = document.getElementById('admin-notice');
  if (!host) return;
  const text = String(message || '').trim();
  if (!text) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }

  host.hidden = false;
  host.innerHTML = '';

  const p = document.createElement('p');
  p.className = tone === 'warn' ? 'error' : 'muted';
  p.textContent = text;
  host.appendChild(p);
}

/* isAdminUi helper moved to admin_actions.js */

function safeTime(isoLike) {
  try {
    const d = new Date(isoLike);
    const t = d.getTime();
    if (Number.isNaN(t)) return 0;
    return t;
  } catch {
    return 0;
  }
}

/* Date and triage formatting helpers moved to admin_renderers.js */

/* ==========================================================================
  HTML renderers
  ---------------------------------------------------------------------------
  As funções a seguir produzem strings de HTML que representam os detalhes de
  um processo de Operação ou NCS. Ao contrário do caminho imperativo
  (createElement/appendChild), estes renderizadores retornam um único
  fragmento de HTML, permitindo updates mais simples via `innerHTML`. Todos
  os dados interpolados são escapados com `escapeHtml` para evitar
  injeção de conteúdo. Sub-blocos de UI são extraídos em helpers menores
  para aumentar a legibilidade.
============================================================================ */

/**
 * Gera o bloco meta (cidade, setor e datas) para ambos os detalhes.
 * @param {any} p Processo
 * @returns {string}
 */
/* HTML renderers moved to admin_renderers.js */
