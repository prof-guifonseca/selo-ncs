/**
 * @file src/dashboards/auditor.js
 * @module dashboards/auditor
 * @description Dashboard do avaliador (auditor). Filas, detalhes de processo e decisão técnica.
 */

import {
  safeCall,
  $id,
  clearEl,
  setText,
  renderEmptyState,
  cssEscape,
  safeScrollToTop,
  formatDateBr,
  showToast,
  PILLARS,
  normalizePillar,
  sortByPillarThenCode,
  backendAdapter,
  getProcessById,
  renderEvidenceList,
  bindEvidenceActionEvents,
  installAuditorChatContextProvider,
  loadStoreOnce,
  // Escape utilitário para evitar injeção de HTML em templates
  escapeHtml,
  // Novo helper para data binding no cabeçalho do detalhe do auditor
  bindText,
} from './shared.js';

// Import UI blocks for rendering small fragments like chips
import { renderChip } from '../shared/blocks.js';

// Import pure renderers extracted into a separate module.  These
// functions produce HTML strings without interacting with the DOM.
import {
  renderAuditorIndicatorsHtml as _renderAuditorIndicatorsHtml,
  renderAuditorProfileSummaryHtml as _renderAuditorProfileSummaryHtml,
  renderAuditorAppealsHtml as _renderAuditorAppealsHtml,
  renderAuditorAppealDetailHtml as _renderAuditorAppealDetailHtml,
  renderAuditorQueueEmptyHtml as _renderAuditorQueueEmptyHtml,
  renderAuditorQueueListHtml as _renderAuditorQueueListHtml,
} from './auditor_renderers.js';

// Importa instalador de ações para o painel do avaliador.  Este
// módulo contém as rotinas de binding de eventos extraídas deste
// arquivo, mantendo aqui apenas a lógica de orquestração.  A
// instalação das ações é realizada dentro de initAuditorDashboard().
import { installAuditorActions } from './auditor_actions.js';

// Import centralised DOM helpers.  These helpers avoid scattered
// document.getElementById/querySelector calls throughout the dashboard.
import { qs, qsa } from './auditor_dom.js';

//
// O dashboard do avaliador utiliza exclusivamente templates de string para
// renderização de listas e tabelas.  O antigo kill‑switch para alternar
// entre renderização imperativa e baseada em template foi removido.

// O front utiliza o estado de sessão para filtrar processos por designação.
// Importa explicitamente o state do módulo superior para evitar depender de globais
// e corrigir erro de referência a variável `state` não declarada.
import { state } from '../state.js';

// Importa catálogo de perguntas de perfil ESG para renderizar o perfil do participante
import { PROFILE_QUESTIONS_V1 } from '../profileQuestions.js';

// Importa API para persistir rascunhos de relatórios quando disponível
import * as api from '../services/api.js';

// Catálogo de indicadores: utilizado no modo workspace para exibir o instrumento completo sem persistir
import { buildDefaultIndicators } from '../indicators.js';

// A fila de processos é sempre renderizada utilizando template strings e `innerHTML`.
// O caminho imperativo anterior foi removido para reduzir verbosidade e tamanho do arquivo.

/* Estado em memória (sem LocalStorage)
 *
 * O nome da store original foi substituído por `dashStore` para deixar claro
 * que se trata de uma store mínima e local ao dashboard, sem integração com
 * o backend ou com outros dashboards. Esta store mantém apenas o estado
 * necessário para renderizar a fila, detalhes de processos, evidências e
 * indicadores do avaliador. Por padrão, todas as listas são arrays vazios.
 */
const dashStore = {
  state: { processes: [], evidences: [], indicators: [], plans: [] },
  computeKPIs: () => null,
  /**
   * Filtra evidências pelo pilar normalizado. Retorna um novo array com as
   * evidências cujo `pillar` corresponde ao pilar informado. Caso o estado
   * ainda não tenha lista de evidências, retorna array vazio.
   * @param {string} pillar
   * @returns {Array<any>}
   */
  getEvidencesByPillar: (pillar) => {
    const p = normalizePillar(pillar);
    const all = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
    return all.filter((ev) => ev && normalizePillar(ev.pillar) === p);
  },
  ensureSelfAssessmentShape: () => ({}),
};

let _auditorInit = false;
let auditorLastProcessId = null;
let auditorLastScrollY = 0;

// Mantém a aba ativa do detalhe do processo no dashboard do avaliador.
// Importante para: (1) permitir navegação entre guias e (2) manter a
// seção ativa ao trocar de processo (ex.: carregar "Último").
let auditorActiveSection = 'summary';

// Rastreia o modo de UI do avaliador.
// Pode assumir 'queue' (padrão), 'detail' (processo em foco) ou 'workspace' (sem processo em foco).
let auditorUiMode = 'queue';

// NOTE_DEBOUNCE_MS e pendingNaReason foram movidos para
// src/dashboards/auditor_actions.js.  As definições locais foram
// removidas para evitar duplicação de estado.

// Armazena rascunhos dos relatórios em memória para o avaliador.  Cada
// propriedade contém um objeto com o texto atual (content), a data da
// última atualização (updatedAt) e o usuário que atualizou (updatedBy).
const auditorReportDrafts = {
  sumario: { content: '', updatedAt: null, updatedBy: null },
  parecer: { content: '', updatedAt: null, updatedBy: null },
  dossie: { content: '', updatedAt: null, updatedBy: null },
};

/*
 * ===========================================================================
 * Renderers baseados em template
 * ===========================================================================
 *
 * As funções abaixo geram HTML completo utilizando template strings para
 * estruturas complexas da UI do avaliador (tabela de indicadores, resumo de
 * perfil/questionário e lista de recursos). Essas funções são sempre
 * utilizadas no dashboard; cada valor interpolado passa por `escapeHtml`
 * para evitar injeções de conteúdo. A estrutura gerada espelha exatamente
 * a estrutura DOM que era montada imperativamente, garantindo
 * compatibilidade com os listeners existentes via `data-*`.
 */

/**
 * Gera HTML da tabela de indicadores para o painel do avaliador.  Esta
 * implementação ordena os indicadores por pilar e código, inclui linhas
 * divisórias por pilar e constrói selects/textarea com os atributos
 * necessários.  Quando em modo workspace (`isWorkspace` true), os
 * controles são desabilitados e marcados como preview.
 *
 * @param {Array<any>} indicators Lista de indicadores a renderizar
 * @param {{ isWorkspace?: boolean }} [opts]
 * @returns {string} HTML da tabela completa
 */
function renderAuditorIndicatorsHtml(indicators, { isWorkspace = false } = {}) {
  // Sempre delega ao renderer puro.  A implementação antiga que
  // construía a tabela inline foi removida para reduzir verbosidade.
  return _renderAuditorIndicatorsHtml(indicators, { isWorkspace });
  // O retorno acima finaliza a execução da função delegando ao
  // renderer puro; o código residual de construção de markup foi
  // removido.
}

/**
 * Gera HTML com o resumo das respostas do questionário ESG do participante.
 * Recebe o objeto de perfil e monta uma lista de perguntas e respostas.
 *
 * @param {any} profile Perfil submetido pelo participante (proc.payload.profile)
 * @returns {string} HTML contendo os elementos das respostas
 */
function renderAuditorProfileSummaryHtml(profile) {
  // Sempre delega ao renderer puro.  A implementação antiga que
  // construía a lista inline foi removida para reduzir verbosidade.
  return _renderAuditorProfileSummaryHtml(profile);
}

/**
 * Gera HTML da lista de recursos/contestações.  Constrói cartões para cada
 * item com título, metadados e um trecho do corpo.  As ações são
 * representadas por atributos `data-action` conforme o comportamento
 * original.  Valores dinâmicos são escapados.
 *
 * @param {Array<any>} list Lista de recursos ou contestações
 * @returns {string} HTML contendo a lista de cartões
 */
function renderAuditorAppealsHtml(list) {
  // Sempre delega ao renderer puro.  A implementação antiga que
  // construía os cartões inline foi removida para reduzir verbosidade.
  return _renderAuditorAppealsHtml(list);
}

/**
 * Gera HTML do estado vazio da fila do avaliador. Quando não existem
 * processos designados ou quando nenhum processo atende aos filtros
 * aplicados, esta função devolve o cartão completo com a mensagem e
 * botão de ação apropriados. Toda interpolação de texto é escapada
 * via `escapeHtml` para evitar que dados dinâmicos quebrem o markup.
 *
 * @param {boolean} anyFiltered Indica se há filtros aplicados na fila
 * @returns {string} HTML contendo o cartão de estado vazio
 */
function renderAuditorQueueEmptyHtml(anyFiltered) {
  // Sempre delega ao renderer puro.  A implementação antiga foi
  // removida para reduzir verbosidade.
  return _renderAuditorQueueEmptyHtml(anyFiltered);
}

/**
 * Gera HTML do detalhe de um recurso/contestação no painel do avaliador.
 * Constrói título, metadados e descrição, além dos botões de ação
 * correspondentes. Todos os valores provenientes do objeto `app` são
 * escapados com `escapeHtml` para evitar injeção de HTML. As datas
 * são formatadas através de `formatDateBr`, com fallback para a
 * representação bruta em caso de erro.
 *
 * @param {any} app Objeto do recurso/contestação
 * @param {number} idx Índice deste recurso na lista
 * @returns {string} HTML completo para o detalhe do recurso
 */
function renderAuditorAppealDetailHtml(app, idx) {
  // Sempre delega ao renderer puro.  A implementação antiga que
  // construía o detalhe inline foi removida para reduzir verbosidade.
  return _renderAuditorAppealDetailHtml(app, idx);
}

/**
 * Recupera o elemento de announcer do painel do avaliador (leitor de tela).
 * Similar ao getClientAnnouncer, mas isolado para o dashboard do auditor.
 * @returns {HTMLElement|null}
 */
function getAuditorAnnouncer() {
  return $id('auditor-dashboard-announcer');
}

/**
 * Anuncia mensagens para o painel do avaliador. Útil para estados de
 * carregamento e erro, garantindo feedback acessível. Quando o elemento
 * announcer não existir, nada acontece.
 * @param {string} message
 */
function announceAuditor(message) {
  const el = getAuditorAnnouncer();
  if (!el) return;
  el.textContent = String(message || '');
}

function ensureStoreShape(storeLike) {
  const s = storeLike && typeof storeLike === 'object' ? storeLike : {};
  return {
    processes: Array.isArray(s.processes) ? s.processes : [],
    evidences: Array.isArray(s.evidences) ? s.evidences : [],
    indicators: Array.isArray(s.indicators) ? s.indicators : [],
    plans: Array.isArray(s.plans) ? s.plans : [],
    ...s,
  };
}

function hydrateStore(storeLike) {
  dashStore.state = ensureStoreShape(storeLike);
}

function upsertProcess(proc) {
  if (!proc || proc.id == null) return;
  const list = Array.isArray(dashStore.state?.processes) ? dashStore.state.processes : [];
  const id = String(proc.id);
  const idx = list.findIndex((p) => p && String(p.id) === id);
  if (idx >= 0) list[idx] = { ...list[idx], ...proc };
  else list.unshift(proc);
  dashStore.state.processes = list;
}

function makeEvidenceMap() {
  const all = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  const map = new Map();
  all.forEach((ev) => {
    if (ev?.id != null) map.set(ev.id, ev);
  });
  return map;
}

function getSlaInfo(proc, now = new Date()) {
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

function setAuditorKpisMode(mode = 'queue') {
  const home = $id('auditor-queue-kpis-home');
  const queue = $id('auditor-queue-kpis');
  const next = mode === 'home' ? 'home' : 'queue';
  if (home) home.hidden = next !== 'home';
  if (queue) queue.hidden = next !== 'queue';
}

function getAuditorEls() {
  return {
    full: $id('auditor-full-dashboard'),
    topPanels: $id('auditor-top-panels'),
    queueRegion: $id('auditor-queue-region'),
    queue: $id('auditor-queue'),
    detail: $id('auditor-process-detail'),
    focusLabel: $id('auditor-focus-label'),
    tabSummary: $id('auditor-tab-summary'),
  };
}

/**
 * Alterna visualização do avaliador entre fila e detalhe.
 * @param {'queue'|'detail'|string} mode
 * @param {{focus?: boolean, restoreFocus?: boolean, restoreScroll?: boolean}} [opts]
 */
export function setAuditorViewMode(mode, opts = {}) {
  const { full, topPanels, queueRegion, queue, detail, focusLabel, tabSummary } = getAuditorEls();
  // Normaliza modo: 'detail' e 'workspace' compartilham o painel de detalhe, mas diferem em visibilidade do topo/fila
  let next;
  if (mode === 'detail' || mode === 'workspace') {
    next = mode;
  } else {
    next = 'queue';
  }

  if (full) full.dataset.mode = next;

  if (next === 'detail') {
    safeCall(() => {
      auditorLastScrollY = window.scrollY || 0;
    });

    if (topPanels) topPanels.hidden = true;
    if (queueRegion) queueRegion.hidden = true;
    if (!queueRegion && queue) queue.hidden = true;

    if (detail) detail.hidden = false;
    if (focusLabel) focusLabel.textContent = 'Processo';
    if (opts.focus !== false && tabSummary) tabSummary.focus();
    auditorUiMode = 'detail';
    return;
  }

  // Workspace: mantém painéis superiores visíveis, oculta fila e mostra detalhe
  if (next === 'workspace') {
    if (topPanels) topPanels.hidden = false;
    if (queueRegion) queueRegion.hidden = true;
    if (!queueRegion && queue) queue.hidden = true;
    if (detail) detail.hidden = false;
    if (focusLabel) focusLabel.textContent = 'Processo';
    auditorUiMode = 'workspace';
    return;
  }

  if (detail) detail.hidden = true;

  if (topPanels) topPanels.hidden = false;
  if (queueRegion) queueRegion.hidden = false;
  if (!queueRegion && queue) queue.hidden = false;

  if (focusLabel) focusLabel.textContent = 'Fila';

  safeCall(() => {
    if (window.ncsSetAuditorChatProcess) window.ncsSetAuditorChatProcess(null);
  });

  if (opts.restoreFocus && auditorLastProcessId) {
    const pid = cssEscape(auditorLastProcessId);
    // Use DOM helper to query for the process item instead of direct document.querySelector
    const item = qs(null, `[data-action="auditor-open-process"][data-id="${pid}"]`);
    if (item) item.focus();
  }

  if (opts.restoreScroll) {
    safeCall(() => window.scrollTo({ top: auditorLastScrollY, behavior: 'smooth' }));
  }
}

export function showAuditorFullDashboard() {
  const home = $id('auditor-dashboard-home');
  const full = $id('auditor-full-dashboard');
  if (home) home.hidden = true;
  if (full) full.hidden = false;

  setAuditorKpisMode('queue');
  safeScrollToTop($id('main-content'));
  safeCall(() => setAuditorViewMode('queue', { restoreFocus: false, restoreScroll: false }));
}

function renderAuditorSlaSummary() {
  const el = $id('auditor-sla-summary');
  if (!el) return;

  const processes = Array.isArray(dashStore.state?.processes) ? dashStore.state.processes : [];
  const now = new Date();

  const counts = { atrasado: 0, atencao: 0, emdia: 0 };
  processes.forEach((p) => {
    const cat = getSlaInfo(p, now)?.category;
    if (cat && Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat] += 1;
  });

  el.textContent = `Atrasados: ${counts.atrasado} · Atenção: ${counts.atencao} · Em dia: ${counts.emdia} · Total: ${processes.length}`;
}

function renderAuditorEvidenceGlobal() {
  PILLARS.forEach((pillar) => {
    const listEl = $id(`auditor-evidence-list-${pillar}`);
    if (!listEl) return;
    const items = dashStore.getEvidencesByPillar?.(pillar) || [];
    renderEvidenceList(listEl, items, { mode: 'auditor' });
  });
}

function renderAuditorProcessEvidence(process) {
  if (!process) {
    renderAuditorEvidenceGlobal();
    return;
  }

  const evidenceIds = Array.isArray(process?.evidenceIds) ? process.evidenceIds : [];
  const evMap = makeEvidenceMap();

  PILLARS.forEach((pillar) => {
    const listEl = $id(`auditor-evidence-list-${pillar}`);
    if (!listEl) return;

    const items = evidenceIds
      .map((id) => evMap.get(id))
      .filter((ev) => ev && normalizePillar(ev.pillar) === pillar);

    renderEvidenceList(listEl, items, { mode: 'auditor' });
  });
}

/**
 * Renderiza fila do avaliador (processos designados + filtros).
 */
export function renderAuditorQueue() {
  const listEl = $id('auditor-process-list');
  if (!listEl) return;

  clearEl(listEl);

  const statusFilter = $id('auditor-filter-status')?.value || '';
  const slaFilter = $id('auditor-filter-sla')?.value || '';
  const cityFilter = ($id('auditor-filter-city')?.value || '').trim().toLowerCase();
  const sectorFilter = ($id('auditor-filter-sector')?.value || '').trim().toLowerCase();
  const searchFilter = ($id('auditor-filter-search')?.value || '').trim().toLowerCase();

  let processes = Array.isArray(dashStore.state?.processes) ? dashStore.state.processes.slice() : [];
  const now = new Date();

  processes.sort((a, b) => {
    const tA = new Date(a?.updatedAt || a?.submittedAt || 0).getTime();
    const tB = new Date(b?.updatedAt || b?.submittedAt || 0).getTime();
    return tB - tA;
  });

  processes = processes.filter((proc) => {
    if (!proc) return false;

    // =========================
    // VISIBILIDADE (compatível com summary view)
    // =========================
    const me = String(state?.session?.email || '').trim().toLowerCase();
    if (!me) return false;

    const a = proc.assignment && typeof proc.assignment === 'object' ? proc.assignment : null;
    const principal = String(a?.principalEmail || '').trim().toLowerCase();
    const reviewer = String(a?.reviewerEmail || '').trim().toLowerCase();
    const hasAssignmentEmails = !!(principal || reviewer);

    // Se vier sem assignment (ex.: ncs_v_process_summary), não filtramos por designação no front.
    if (hasAssignmentEmails && principal !== me && reviewer !== me) return false;

    // =========================
    // filtros (status/sla/cidade/setor/busca)
    // =========================
    if (statusFilter && String(proc.status || '').trim() !== statusFilter) return false;

    if (slaFilter) {
      const { category } = getSlaInfo(proc, now);
      if (slaFilter !== category) return false;
    }

    if (cityFilter) {
      const city = String(proc.city || '').toLowerCase();
      if (!city.includes(cityFilter)) return false;
    }

    if (sectorFilter) {
      const sector = String(proc.sector || '').toLowerCase();
      if (!sector.includes(sectorFilter)) return false;
    }

    if (searchFilter) {
      const companyName = String(proc.company || proc.company_name || proc.companyName || '').toLowerCase();
      const pid = String(proc.id || '').toLowerCase();
      if (!companyName.includes(searchFilter) && !pid.includes(searchFilter)) return false;
    }

    return true;
  });

  if (!processes.length) {
    const anyFiltered = !!(statusFilter || slaFilter || cityFilter || sectorFilter || searchFilter);
    // Usa renderer puro para o estado vazio da fila e aplica ao container via innerHTML
    listEl.innerHTML = renderAuditorQueueEmptyHtml(anyFiltered);
    safeCall(() => setAuditorViewMode('queue', { restoreFocus: false, restoreScroll: false }));
    return;
  }

  // Renderiza a lista de processos via renderer puro.  O renderer
  // encapsula a geração de markup e garante escape adequado.
  {
    const html = _renderAuditorQueueListHtml(processes);
    listEl.innerHTML = html;
    return;
  }
}

/**
 * Renderiza painel de detalhe do processo selecionado.
 * @param {string|number} processId
 */
export function renderAuditorProcessDetail(processId) {
  const detailSection = $id('auditor-process-detail');
  if (!detailSection) return;

  auditorLastProcessId = processId || null;

  const proc = Array.isArray(dashStore.state?.processes)
    ? dashStore.state.processes.find((p) => p && String(p.id) === String(processId))
    : null;

  if (!proc) {
    // microcopy + tentativa de fetch pontual
    // Usa bindText para preencher o cabeçalho do detalhe com placeholders
    const headerVm = {
      processName: 'Carregando processo…',
      processId: String(processId || '—'),
      processStatus: '—',
      processStage: '—',
      processSla: '—',
      processEvidenceCount: '—',
    };
    bindText(detailSection, headerVm);
    // Renderiza painel vazio de evidências e indicadores enquanto carrega
    renderAuditorProcessEvidence(null);
    renderAuditorIndicators();

    safeCall(() => setAuditorViewMode('detail', { focus: true }));
    // Oculta callout do workspace quando tenta carregar um processo
    const callout = $id('auditor-workspace-callout');
    if (callout) callout.hidden = true;

    safeCall(async () => {
      const remote = await getProcessById(processId);
      if (remote) {
        upsertProcess(remote);
        renderAuditorProcessDetail(processId);
      } else {
        showToast('Processo indisponível no momento. Tente atualizar a fila.', 'warning');
      }
    });

    return;
  }

  safeCall(() => {
    if (window.ncsSetAuditorChatProcess) window.ncsSetAuditorChatProcess(proc);
  });

  safeCall(() => {
    setAuditorViewMode('detail', { focus: true });
    setText($id('auditor-focus-label'), proc.company || proc.company_name || proc.companyName || 'Processo');
  });

  // Monta view-model para o cabeçalho e vincula ao DOM via bindText
  {
    const { daysLeft } = getSlaInfo(proc, new Date());
    const slaText = Number.isFinite(daysLeft) ? `${daysLeft} dias` : '—';
    const count = Array.isArray(proc.evidenceIds)
      ? proc.evidenceIds.length
      : proc.evidenceCount || 0;
    const headerVm = {
      processName: proc.company || proc.company_name || proc.companyName || 'Processo',
      processId: proc.id || '—',
      processStatus: proc.status || '—',
      processStage: proc.stage || proc.status || '—',
      processSla: slaText,
      processEvidenceCount: String(count),
    };
    bindText(detailSection, headerVm);
  }

  detailSection.hidden = false;
  renderAuditorProcessEvidence(proc);
  renderAuditorIndicators();
  safeCall(renderAuditorSlaSummary);

  // Renderiza perfil e questionário do participante para o avaliador
  safeCall(() => renderAuditorProfileSummary(proc));

  // Renderiza recursos/contestação, quando aplicável
  safeCall(() => renderAuditorAppeals(proc));

  // Carrega rascunhos de relatórios salvos no processo (se existirem).  As
  // chaves esperadas em proc.reviews.drafts são 'sumario', 'parecer' e
  // 'dossie'.  Qualquer valor inexistente é normalizado para string vazia.
  try {
    const drafts = proc && proc.reviews && typeof proc.reviews === 'object' ? proc.reviews.drafts || {} : {};
    ['sumario', 'parecer', 'dossie'].forEach((t) => {
      const d = drafts && drafts[t] ? drafts[t] : {};
      const content = typeof d.content === 'string' ? d.content : '';
      auditorReportDrafts[t] = {
        content,
        updatedAt: d.updatedAt || null,
        updatedBy: d.updatedBy || null,
      };
    });
  } catch {
    // noop: mantém drafts anteriores
  }

  // Oculta callout de workspace quando um processo está em foco
  const callout2 = $id('auditor-workspace-callout');
  if (callout2) callout2.hidden = true;

  // Mantém a navegação interna consistente: após carregar/atualizar um
  // processo, reaplica a aba ativa (ou volta para 'summary' se não existir).
  safeCall(() => switchAuditorProcessSection(auditorActiveSection));
}

/* ========================================================================== */
/* Navegação interna do detalhe do processo (tabs)                              */
/* ========================================================================== */

/**
 * Alterna painel ativo do detalhe do avaliador (tabs dentro de "Processo").
 *
 * Observação importante: os botões no HTML usam `data-action="auditor-switch-detail"`
 * e `data-section="..."`. O handler de actions chama esta função.
 *
 * @param {string} section
 */
export function switchAuditorProcessSection(section) {
  const target = String(section || '').trim();
  if (!target) return;

  // Se a seção não existe no DOM, volte para o resumo.
  const exists = qs(null, `.auditor-panel[data-panel="${cssEscape(target)}"]`);
  const next = exists ? target : 'summary';
  auditorActiveSection = next;

  const buttons = qsa(null, '[data-action="auditor-switch-detail"]');
  buttons.forEach((btn) => {
    const isActive = btn?.dataset?.section === next;
    btn.classList.toggle('active', isActive);
    // A marcação de tabs usa aria-selected; mantenha compatibilidade com CSS/JS.
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  const panels = qsa(null, '.auditor-panel');
  panels.forEach((panel) => {
    const name = panel?.dataset?.panel || '';
    const isActive = name === next;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  // Render best-effort para seções dependentes de dados.
  const proc = getAuditorActiveProcess();
  if (next === 'evidence') {
    safeCall(() => renderAuditorProcessEvidence(proc));
  } else if (next === 'indicators') {
    safeCall(() => renderAuditorIndicators());
  } else if (next === 'summary') {
    safeCall(() => renderAuditorProfileSummary(proc));
  } else if (next === 'appeals') {
    safeCall(() => renderAuditorAppeals(proc));
  }

  // Mantém UX previsível: ao trocar de guia, volte para o topo do detalhe.
  safeCall(() => safeScrollToTop($id('auditor-process-detail')));
}

function getAuditorActiveProcess() {
  const pid = auditorLastProcessId;
  if (!pid) return null;

  const proc = Array.isArray(dashStore.state?.processes)
    ? dashStore.state.processes.find((p) => p && String(p.id) === String(pid))
    : null;

  return proc || null;
}

function getAuditorIndicatorsSource() {
  const proc = getAuditorActiveProcess();
  if (proc && Array.isArray(proc.indicators) && proc.indicators.length) return proc.indicators;
  return Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
}

function getUniqueIndicatorLists() {
  const lists = [];
  const proc = getAuditorActiveProcess();
  const a = proc && Array.isArray(proc.indicators) ? proc.indicators : null;
  const b = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : null;
  if (a) lists.push(a);
  if (b && b !== a) lists.push(b);
  return lists;
}

function updateIndicatorStatusLocal(indicatorId, role, status) {
  const id = String(indicatorId);
  const r = role === 'revisor' ? 'revisor' : 'principal';
  const lists = getUniqueIndicatorLists();

  lists.forEach((arr) => {
    const ind = Array.isArray(arr) ? arr.find((x) => String(x?.id) === id) : null;
    if (!ind) return;
    if (r === 'principal') ind.statusPrincipal = status;
    else ind.statusRevisor = status;
    ind.updatedAt = new Date().toISOString();
  });
}

function updateIndicatorNoteLocal(indicatorId, role, note) {
  const id = String(indicatorId);
  const r = role === 'revisor' ? 'revisor' : 'principal';
  const lists = getUniqueIndicatorLists();

  lists.forEach((arr) => {
    const ind = Array.isArray(arr) ? arr.find((x) => String(x?.id) === id) : null;
    if (!ind) return;
    if (r === 'principal') ind.notePrincipal = String(note ?? '');
    else ind.noteRevisor = String(note ?? '');
    ind.updatedAt = new Date().toISOString();
  });
}

function renderAuditorIndicators(opts = {}) {
  const container = $id('auditor-indicators-grid');
  if (!container) return;
  // Determina se estamos em modo workspace (sem processo em foco)
  const activeProc = getAuditorActiveProcess();
  let indicators = null;
  const isWorkspace = !activeProc;
  if (isWorkspace) {
    // Usa o catálogo completo de indicadores para o modo preview
    try {
      indicators = buildDefaultIndicators() || [];
    } catch {
      indicators = [];
    }
  } else {
    indicators = getAuditorIndicatorsSource();
  }
  clearEl(container);

  if (!Array.isArray(indicators) || indicators.length === 0) {
    renderEmptyState(container, {
      message: 'Indicadores indisponíveis para este processo no momento. Integração em atualização.',
      ctaLabel: 'Voltar à fila',
      action: 'auditor-back',
      buttonClass: 'btn btn-secondary btn-small btn-block',
    });
    return;
  }

  // Renderiza a tabela via template string e aplica restauração de foco quando necessário.
  container.innerHTML = renderAuditorIndicatorsHtml(indicators, { isWorkspace });
  const rf = opts?.restoreFocus;
  if (rf?.indicatorId && rf?.role && rf?.field) {
    const sel =
      rf.field === 'note'
        ? `textarea[data-indicator-id="${cssEscape(rf.indicatorId)}"][data-role="${cssEscape(rf.role)}"]`
        : `select[data-indicator-id="${cssEscape(rf.indicatorId)}"][data-role="${cssEscape(rf.role)}"]`;
    safeCall(() => {
      const el = container.querySelector(sel);
      if (el) el.focus();
    });
  }
}

/**
 * Abre o painel do avaliador em modo workspace (sem processo selecionado).
 * Preenche cabeçalho com placeholders e exibe callout de orientação.
 */
export function enterAuditorWorkspace() {
  // limpa processo ativo
  auditorLastProcessId = null;
  auditorUiMode = 'workspace';

  // Atualiza cabeçalho do detalhe usando data binding
  {
    const detailSection = $id('auditor-process-detail');
    const headerVm = {
      processName: 'Processo',
      processId: '—',
      processStatus: '—',
      processStage: '—',
      processSla: '—',
      processEvidenceCount: '—',
    };
    bindText(detailSection, headerVm);
  }

  // Exibe callout no modo workspace
  const callout = $id('auditor-workspace-callout');
  if (callout) callout.hidden = false;

  // Renderiza evidências globais e tabela de indicadores padrão
  safeCall(() => setAuditorViewMode('workspace', { focus: false }));
  renderAuditorProcessEvidence(null);
  renderAuditorIndicators();
  safeCall(renderAuditorSlaSummary);

  // Reset de navegação interna
  safeCall(() => switchAuditorProcessSection('summary'));
}

/**
 * Retorna quantidade de processos na dashStore do auditor.
 * Útil para decidir se a fila deve ser exibida.
 * @returns {number}
 */
export function getAuditorProcessesCount() {
  try {
    const list = Array.isArray(dashStore.state?.processes) ? dashStore.state.processes : [];
    return list.length;
  } catch {
    return 0;
  }
}

/* Binds */


/* Init */

export function initAuditorDashboard() {
  if (!_auditorInit) {
    _auditorInit = true;

    installAuditorChatContextProvider();

    bindEvidenceActionEvents(); // global
    // Instala todas as ações do dashboard do avaliador.  O instalador
    // recebe explicitamente as funções de renderização e helpers para
    // evitar dependências circulares e manter este módulo focado na
    // orquestração.  As funções removidas anteriormente (bindAuditor*
    // e clearAuditorFilters) foram movidas para auditor_actions.js.
    installAuditorActions({
      renderAuditorQueue,
      renderAuditorProcessDetail,
      renderAuditorIndicators,
      renderAuditorEvidenceGlobal,
      renderAuditorSlaSummary,
      updateIndicatorStatusLocal,
      updateIndicatorNoteLocal,
      setAuditorViewMode,
      loadStoreOnce,
      hydrateStore,
      backendAdapter,
    });
  }

  setAuditorKpisMode('queue');
  setText($id('auditor-focus-label'), 'Fila');

  // Anuncia carregamento do painel para acessibilidade e feedback.
  announceAuditor('Carregando painel do avaliador…');

  Promise.resolve(loadStoreOnce())
    .then((store) => {
      // Limpa anúncio de carregamento
      announceAuditor('');
      hydrateStore(store);

      safeCall(renderAuditorQueue);
      safeCall(renderAuditorIndicators);
      safeCall(renderAuditorEvidenceGlobal);
      safeCall(renderAuditorSlaSummary);

      // Heurística: abre automaticamente se houver 1 processo, ou workspace se não houver processos
      const count = Array.isArray(dashStore.state?.processes) ? dashStore.state.processes.length : 0;

      if (count === 1) {
        const only = dashStore.state.processes[0];
        if (only && only.id != null) safeCall(() => renderAuditorProcessDetail(String(only.id)));
        else safeCall(() => enterAuditorWorkspace());
        return;
      }

      if (count === 0) {
        safeCall(() => enterAuditorWorkspace());
        return;
      }

      safeCall(() => setAuditorViewMode('queue', { restoreFocus: false, restoreScroll: false }));
    })
    .catch(() => {
      // Em caso de falha, anuncia e mostra toast de erro.
      announceAuditor('Falha ao carregar dados do painel. Verifique sua conexão e tente novamente.');
      showToast('Erro ao carregar dados do painel.', 'error');
      safeCall(renderAuditorQueue);
      safeCall(renderAuditorIndicators);
    });
}

/* ========================================================================== */
/* Novo: Perfil/Questionário, Relatórios e Recursos                            */
/* ========================================================================== */

/**
 * Preenche a aba de resumo (perfil/questionário) com base no processo
 * fornecido.  Quando não houver perfil submetido, exibe um estado vazio
 * claro ao avaliador.  Este helper utiliza os campos definidos no HTML
 * (ids auditor-profile-*) para preencher as informações em modo somente
 * leitura.  Respostas do questionário ESG são renderizadas dinamicamente
 * dentro de #auditor-profile-answers.
 *
 * @param {any} proc Processo em foco contendo payload.profile
 */
function renderAuditorProfileSummary(proc) {
  const emptyMsg = $id('auditor-profile-empty');
  const answersContainer = $id('auditor-profile-answers');

  // Se não houver contêiner, nada a fazer.
  if (!answersContainer) return;

  const profile = proc && proc.payload && proc.payload.profile ? proc.payload.profile : null;
  // Limpa valores previos
  const fields = [
    'legalName',
    'cnpj',
    'cnaes',
    'city',
    'sector',
    'site',
    'mission',
    'vision',
    'values',
    'declarations',
  ];
  fields.forEach((field) => {
    const el = $id(`auditor-profile-${field}`);
    if (el) el.textContent = '—';
  });

  if (!profile) {
    // Perfil ausente: mostra mensagem e oculta respostas
    if (emptyMsg) emptyMsg.hidden = false;
    answersContainer.innerHTML = '';
    answersContainer.hidden = true;
    return;
  }

  // Perfil presente: preenche campos e renderiza respostas
  if (emptyMsg) emptyMsg.hidden = true;
  answersContainer.hidden = false;

  const org = profile.org && typeof profile.org === 'object' ? profile.org : {};
  const esg = profile.esg && typeof profile.esg === 'object' ? profile.esg : {};
  const meta = profile.meta && typeof profile.meta === 'object' ? profile.meta : {};

  /**
   * Define valor legível para um span de perfil.  Converte valores nulos
   * ou vazios em um travessão.  Para números ou strings retorna
   * trim() do valor.
   * @param {string} id
   * @param {any} value
   */
  function setValue(id, value) {
    const el = $id(`auditor-profile-${id}`);
    if (!el) return;
    const v = value == null ? '' : String(value).trim();
    el.textContent = v ? v : '—';
  }

  // Campos simples
  setValue('legalName', org.legalName);
  setValue('cnpj', org.cnpj);
  // CNAEs: concatena principal e secundário se existirem
  let cnaeText = '';
  const main = org.cnaeMain || '';
  const sec = org.cnaeSecondary || '';
  if (main && sec) cnaeText = `${main} / ${sec}`;
  else cnaeText = main || sec || '';
  setValue('cnaes', cnaeText);
  // Município/UF
  let cityText = '';
  if (org.city) cityText = String(org.city);
  if (org.uf) cityText = cityText ? `${cityText}/${org.uf}` : String(org.uf);
  setValue('city', cityText);
  setValue('sector', org.sector);
  setValue('site', org.site);
  setValue('mission', org.mission);
  setValue('vision', org.vision);
  setValue('values', org.values);

  // Declarações/Aceites: procura em proc.declarations, proc.payload.declarations ou profile.meta.declarations
  let declList = '';
  try {
    let d = null;
    if (proc && proc.declarations) d = proc.declarations;
    else if (proc && proc.payload && proc.payload.declarations) d = proc.payload.declarations;
    else if (meta && meta.declarations) d = meta.declarations;
    if (Array.isArray(d)) {
      declList = d.join(', ');
    } else if (d && typeof d === 'object') {
      declList = Object.keys(d)
        .filter((k) => d[k])
        .join(', ');
    } else if (d != null) {
      declList = String(d);
    }
  } catch {
    declList = '';
  }
  setValue('declarations', declList);

  // Renderiza respostas do questionário ESG utilizando template string
  answersContainer.innerHTML = renderAuditorProfileSummaryHtml(profile);
}

/**
 * Renderiza a lista de recursos/contestações e reseta o painel de detalhe.
 * A UI consiste em cartões clicáveis.  Quando não houver recursos, exibe
 * um estado vazio apropriado.  Apenas propriedades defensivamente
 * acessíveis são consideradas (payload.appeals ou payload.recourses).
 * @param {any} proc
 */
function renderAuditorAppeals(proc) {
  const listEl = $id('auditor-appeals-list');
  const detailEl = $id('auditor-appeal-detail');
  if (!listEl) return;
  clearEl(listEl);
  if (detailEl) {
    detailEl.innerHTML = '';
    detailEl.hidden = true;
  }
  const appeals =
    (proc && proc.payload && (proc.payload.appeals || proc.payload.recourses)) || [];
  if (!Array.isArray(appeals) || appeals.length === 0) {
    listEl.dataset.empty = 'appeals';
    listEl.textContent = 'Nenhum recurso/contestação foi aberto neste ciclo.';
    return;
  }
  delete listEl.dataset.empty;
  // Renderiza cartões através do renderer baseado em template
  listEl.innerHTML = renderAuditorAppealsHtml(appeals);
  return;
}

/**
 * Exibe o detalhe de um recurso selecionado.  Usa o índice do recurso na
 * lista para localizar o objeto correspondente dentro de payload.appeals ou
 * payload.recourses.  Renderiza informações completas e ações stub.
 *
 * @param {string|number} index Índice do recurso na lista
 */
function openAuditorAppealDetail(index) {
  const detailEl = $id('auditor-appeal-detail');
  if (!detailEl) return;
  const proc = getAuditorActiveProcess();
  if (!proc) return;
  const appeals =
    (proc && proc.payload && (proc.payload.appeals || proc.payload.recourses)) || [];
  const idx = Number(index);
  const app = Array.isArray(appeals) ? appeals[idx] : null;
  if (!app) return;
  // Renderiza conteúdo do detalhe via renderer puro e aplica ao DOM
  detailEl.innerHTML = renderAuditorAppealDetailHtml(app, idx);
  detailEl.hidden = false;
}

/**
 * Alterna a visualização dos editores de relatório no painel de entregáveis.
 * Ativa a aba selecionada e preenche o textarea com o rascunho atual do
 * tipo correspondente.  Atualiza também o preview para refletir o
 * rascunho salvo.
 * @param {string} type Tipo do relatório ('sumario', 'parecer' ou 'dossie')
 */
function openAuditorReportEditor(type) {
  const panel = $id('auditor-panel-deliverables');
  if (!panel) return;
  // Atualiza botões de navegação
  const nav = panel.querySelectorAll('.report-nav-btn');
  nav.forEach((btn) => {
    const t = btn && btn.dataset ? btn.dataset.type : '';
    if (btn) btn.classList.toggle('active', t === type);
  });
  // Alterna seções
  const sections = panel.querySelectorAll('.report-editor-section');
  sections.forEach((sec) => {
    const t = sec && sec.dataset ? sec.dataset.reportType : '';
    sec.hidden = t !== type;
  });
  // Preenche textarea com rascunho
  const textarea = $id(`auditor-report-${type}-content`);
  if (textarea) {
    const draft = auditorReportDrafts[type] ? auditorReportDrafts[type].content : '';
    textarea.value = draft || '';
  }
  // Atualiza preview com rascunho salvo
  const preview = $id(`auditor-report-preview-${type}`);
  if (preview) {
    const draft = auditorReportDrafts[type] ? auditorReportDrafts[type].content : '';
    preview.innerHTML = draft ? String(draft).replace(/\n/g, '<br>') : '';
  }
}

/**
 * Persiste o rascunho do relatório atual no backend quando possível.  Se
 * api.updateProcessReviews estiver indisponível, mantém apenas o rascunho
 * em memória e informa via toast.  Sempre atualiza o objeto local
 * auditorReportDrafts.
 * @param {string} type
 */
async function saveAuditorReportDraft(type) {
  const textarea = $id(`auditor-report-${type}-content`);
  if (!textarea) return;
  const content = String(textarea.value || '');
  const email = String(state && state.session && state.session.email || '').trim();
  const updatedAt = new Date().toISOString();
  // Atualiza memória local
  auditorReportDrafts[type] = { content, updatedAt, updatedBy: email };
  const proc = getAuditorActiveProcess();
  if (!proc || !proc.id) {
    showToast('warning', 'Selecione um processo para salvar o rascunho.');
    return;
  }
  // Tenta persistir no backend
  try {
    if (api && typeof api.updateProcessReviews === 'function') {
      const patch = { drafts: {} };
      patch.drafts[type] = { content, updatedAt, updatedBy: email };
      await api.updateProcessReviews(String(proc.id), patch);
      // Atualiza a estrutura do processo em memória
      if (!proc.reviews) proc.reviews = {};
      if (!proc.reviews.drafts) proc.reviews.drafts = {};
      proc.reviews.drafts[type] = { content, updatedAt, updatedBy: email };
      showToast('success', 'Rascunho salvo.');
    } else {
      showToast('info', 'Funcionalidade em desenvolvimento: rascunho ainda não persistido no backend.');
    }
  } catch (err) {
    console.error(err);
    showToast('error', 'Falha ao salvar rascunho.');
  }
}

/**
 * Gera um rascunho por IA ou abre o chat para auxílio.  Quando não há
 * integração de IA disponível, avisa o usuário e não altera o conteúdo.
 *
 * @param {string} type
 */
function generateAuditorReportAI(type) {
  // Placeholder para integração de IA.  Ao ser implementado, poderá
  // utilizar backendAdapter ou outras APIs para compor rascunhos.
  showToast('info', 'Funcionalidade em desenvolvimento: IA ainda não habilitada.');
}

/**
 * Atualiza a prévia do relatório exibindo o conteúdo atual do textarea
 * correspondente.  Converte quebras de linha em <br>.  Não salva o
 * conteúdo em nenhum lugar.
 *
 * @param {string} type
 */
function previewAuditorReport(type) {
  const textarea = $id(`auditor-report-${type}-content`);
  const preview = $id(`auditor-report-preview-${type}`);
  if (!preview) return;
  const text = String(textarea && textarea.value || '').trim();
  preview.innerHTML = text ? text.replace(/\n/g, '<br>') : '';
  showToast('success', 'Preview atualizado.');
}

/* ========================================================================== */
/* Exports                                                                   */
/* ========================================================================== */

export {
  renderAuditorProfileSummary,
  renderAuditorAppeals,
  openAuditorAppealDetail,
  openAuditorReportEditor,
  saveAuditorReportDraft,
  generateAuditorReportAI,
  previewAuditorReport,
};
