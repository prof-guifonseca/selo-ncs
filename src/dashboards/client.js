/**
 * @file src/dashboards/client.js
 * @module dashboards/client
 * @description Dashboard do participante (client). Submissão, evidências e visualização de entregáveis.
 */

// src/dashboards/client.js — Dashboard do cliente (autônomo)
// Extraído de src/dashboard.js

// The client dashboard no longer relies on any legacy client‑side store for its
// operational state.  All authoritative data (processes, KPIs, evidences)
// come from the backend.  Define a minimal stub to satisfy optional
// references without persisting or reading any state locally.
const dashStore = {
  /**
   * Placeholder for the legacy state.  It is intentionally empty: the
   * dashboards must fetch data from the backend instead of relying on
   * local storage.
   */
  state: {},
  /**
   * Stubbed computeKPIs() returns null.  KPI computation is handled on
   * the backend.
   * @returns {null}
   */
  computeKPIs: () => null,
  /**
   * Retorna as evidências filtradas pelo pilar normalizado.  Quando o
   * estado contém evidências carregadas via loadClientContext() esta
   * função filtra a lista em memória.  Caso contrário retorna um
   * array vazio para evitar que a UI quebre.
   * @param {string} pillar
   * @returns {any[]}
   */
  getEvidencesByPillar: (pillar) => {
    const p = normalizePillar(pillar);
    const all = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
    return all.filter((ev) => ev && normalizePillar(ev.pillar) === p);
  },
  /**
   * Stub for ensuring the self‑assessment shape.  Does nothing.
   */
  ensureSelfAssessmentShape: () => {},
};
import { state } from '../state.js';

// API helpers (process, evidence) and deliverables/report generators
import { listProcesses, upsertProcessSubmission, listEvidence } from '../services/api.js';
import { generateActionPlanHTML, generateSealCertificateHTML } from '../deliverables.js';
import { generateExecutiveSummaryHTML } from '../report.js';
import {
  safeCall,
  $id,
  clearEl,
  setText,
  renderEmptyState,
  cssEscape,
  escapeHtml,
  safeScrollToTop,
  formatDateBr,
  showToast,
  PILLARS,
  normalizePillar,
  sortByPillarThenCode,
  backendAdapter,
  getProcessById,
  getIndicatorsForProcess,
  getPlansForProcess,
  getUniqueIndicatorLists,
  computeProgressFromIndicators,
  renderEvidenceList,
  bindEvidenceActionEvents,
  installClientChatContextProvider,
  debounce,
  loadStoreOnce,
  bindText,
} from './shared.js';
import { getFormObject, fillForm } from './shared.js';
// Importa construtor de indicadores padrão para fallback de 12 linhas
import { buildDefaultIndicators } from '../indicators.js';

// Import pure renderers extracted into a separate module.  These
// functions produce HTML strings without interacting with the DOM.  We alias
// the names to avoid clashing with existing legacy implementations in
// this orchestrator.  They are used in renderClientSelfAssessment()
// and renderClientIndicatorsOverview() to reduce verbosity.
import {
  renderClientSelfAssessmentHtml as pureRenderClientSelfAssessmentHtml,
  renderClientIndicatorsOverviewHtml as pureRenderClientIndicatorsOverviewHtml,
} from './client_renderers.js';

// Import action installer for the client dashboard.  This module
// encapsulates event binding and mutation handlers (navigation and
// evidence upload).  It replaces bindClientNavEvents() and
// bindEvidenceUploadEvents() from this file.
import { installClientActions } from './client_actions.js';
// Catálogo de perguntas de perfil ESG compartilhado com o dashboard do avaliador
import { PROFILE_QUESTIONS_V1 } from '../profileQuestions.js';

/* ========================================================================== */
/* Constantes e Estado Local                                                  */
/* ========================================================================== */

const CLIENT_SELF_LIMIT = 12;
const NOTE_DEBOUNCE_MS = 250;

// The client dashboard always uses template-based rendering for the self
// assessment, profile questions and profile form handling.  Legacy fallback
// implementations (imperative DOM construction and ID-based form reading)
// have been removed to reduce bundle size and complexity.


let clientLastScrollY = 0;
let _clientInit = false;
let _boundEvidenceUploads = false;

/* ========================================================================== */
/* Context loading helpers                                                   */
/* ========================================================================== */

/**
 * Resolve o processo ativo do cliente.  Se já houver um processo
 * carregado no dashStore.state ele é reutilizado.  Caso contrário
 * tenta listar processos do backend e usa o primeiro.  Quando não
 * existir nenhum processo ainda, cria uma submissão mínima com base
 * na empresa ou email da sessão.  Sempre atualiza dashStore.state.process
 * quando um processo é encontrado ou criado.
 *
 * @returns {Promise<any|null>} Retorna o processo ativo ou null.
 */
async function ensureActiveProcess() {
  // Usa processo já carregado quando possível
  const current = dashStore.state?.process;
  if (current && current.id) return current;

  // Tenta obter lista de processos existentes
  let processes = [];
  try {
    const list = await listProcesses?.({}) || [];
    if (Array.isArray(list)) {
      processes = list;
    } else if (list && Array.isArray(list.items)) {
      processes = list.items;
    }
  } catch {
    processes = [];
  }
  let p = processes && processes.length > 0 ? processes[0] : null;
  if (!p) {
    // Cria processo mínimo com base na empresa ou email
    const company = state?.session?.company || state?.session?.email || '';
    try {
      const res = await upsertProcessSubmission?.({ company }) || {};
      // Alguns drivers retornam { process: {...} } ou { payload: {...} }
      p = res.process || res.payload || null;
    } catch {
      p = null;
    }
  }
  if (p) {
    dashStore.state = { ...(dashStore.state || {}), process: p };
  }
  return p;
}

/**
 * Carrega o contexto completo do cliente: processo ativo, indicadores e
 * evidências.  Garante que o processo exista (via ensureActiveProcess)
 * antes de buscar evidências e indicadores.  Atualiza dashStore.state com
 * { process, indicators, evidences } e retorna o estado.
 *
 * @returns {Promise<{process:any, indicators:any[], evidences:any[]}>}
 */
async function loadClientContext() {
  const proc = await ensureActiveProcess();
  const processId = proc && proc.id ? String(proc.id) : null;

  // Evidências
  let evidences = [];
  if (processId) {
    try {
      const evList = await listEvidence?.({ processId }) || [];
      if (Array.isArray(evList)) {
        evidences = evList;
      } else if (evList && Array.isArray(evList.items)) {
        evidences = evList.items;
      }
    } catch {
      evidences = [];
    }
  }

  // Indicadores
  let processDetails = proc;
  if (processId) {
    try {
      const detail = await getProcessById?.(processId);
      if (detail) processDetails = detail;
    } catch {
      // fallback to current proc
    }
  }
  const indicators = Array.isArray(getIndicatorsForProcess?.(processDetails))
    ? getIndicatorsForProcess(processDetails)
    : [];
  // Garante que sempre haja 12 indicadores: quando o backend retornar
  // lista vazia ou incompleta, utiliza o fallback de indicadores padrão.
  let indList = Array.isArray(indicators) ? indicators : [];
  if (!Array.isArray(indList) || indList.length !== 12) {
    try {
      const fallback = buildDefaultIndicators?.() || [];
      const byCode = new Map();
      if (Array.isArray(indList)) {
        indList.forEach((it) => {
          const key = String(it && (it.code || it.id));
          if (key) byCode.set(key, it);
        });
      }
      indList = Array.isArray(fallback)
        ? fallback.map((base) => {
            const key = String(base && (base.code || base.id));
            const existing = byCode.get(key);
            return existing ? { ...base, ...existing } : base;
          })
        : indList;
    } catch {
      // fallback em caso de erro
      indList = indList || [];
    }
  }

  dashStore.state = { process: processDetails, indicators: indList, evidences };
  return dashStore.state;
}

// Função stub para evitar crash se o demo.js não estiver carregado
function applyClientDemo() {
  if (typeof window.applyClientDemo === 'function') {
    window.applyClientDemo();
  }
}

/* ========================================================================== */
/* Cliente — view mode (overview <-> focus)                                   */
/* ========================================================================== */

function getClientEls() {
  const root = $id('client-full-dashboard');
  return {
    full: root,
    topPanels: $id('client-top-panels'),
    topbar: root ? root.querySelector('.dash-topbar') : null,
    hero: root ? root.querySelector('.dash-hero') : null,
    subnav: root ? root.querySelector('.client-subnav') : null,
  };
}

/**
 * Alterna visualização do cliente entre overview e focus.
 * @param {'overview'|'focus'|string} mode
 * @param {{restoreScroll?: boolean}} [opts]
 */
export function setClientViewMode(mode, opts = {}) {
  const { full, topPanels, topbar, hero, subnav } = getClientEls();
  const next = mode === 'focus' ? 'focus' : 'overview';

  if (full) full.dataset.mode = next;

  if (next === 'focus') {
    safeCall(() => {
      clientLastScrollY = window.scrollY || 0;
    });

    if (topPanels) topPanels.hidden = true;
    else {
      if (topbar) topbar.hidden = true;
      if (hero) hero.hidden = true;
    }

    safeCall(() => {
      if (subnav) subnav.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return;
  }

  if (topPanels) topPanels.hidden = false;
  else {
    if (topbar) topbar.hidden = false;
    if (hero) hero.hidden = false;
  }

  if (opts.restoreScroll) {
    safeCall(() => {
      window.scrollTo({ top: clientLastScrollY, behavior: 'smooth' });
    });
  }
}

/* ========================================================================== */
/* Navegação interna do dashboard                                              */
/* ========================================================================== */

/**
 * Exibe dashboard completo do cliente e opcionalmente navega para uma seção.
 * @param {string} [section]
 */
export function showClientFullDashboard(section) {
  const home = $id('client-dashboard-home');
  const full = $id('client-full-dashboard');
  if (home) home.hidden = true;
  if (full) full.hidden = false;

  if (section) switchClientSection(section);

  safeCall(() => {
    setClientViewMode(section && section !== 'overview' ? 'focus' : 'overview', { restoreScroll: false });
  });

  safeScrollToTop($id('main-content'));
  safeCall(() => applyClientDemo());
}

/**
 * Alterna painel ativo do cliente (tabs).
 * @param {string} section
 */
export function switchClientSection(section) {
  const target = String(section || '').trim();
  if (!target) return;

  // Aviso: se o perfil estiver incompleto e o usuário navegar para outra seção
  // que não seja a de perfil, apenas mostramos uma mensagem informativa.
  // Não bloqueamos a navegação para permitir fluxo mais fluido no dashboard.
  try {
    const { org, esg, meta } = getProfileFromProcess();
    const incomplete = validateProfile({ org, esg, meta }).length > 0;
    if (target !== 'profile' && incomplete) {
      // Em vez de impedir a navegação, apenas alertamos o usuário de que o perfil está incompleto.
      showToast('info', 'Perfil incompleto; algumas funcionalidades podem estar limitadas.');
    }
  } catch {
    // se houver erro ao validar o perfil, ignore e permita a navegação normalmente
  }

  const allButtons = document.querySelectorAll('[data-action="client-switch-section"]');
  allButtons.forEach((btn) => {
    const isActive = btn.dataset.section === target;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  const panels = document.querySelectorAll('.client-section');
  panels.forEach((panel) => {
    const name = panel.dataset.panel;
    const isActive = name === target;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  safeCall(() => setClientViewMode(target === 'overview' ? 'overview' : 'focus', { restoreScroll: false }));

  // Dispara renders específicos para cada seção.  Ao entrar em uma seção
  // chamada pela subnav, o painel correspondente é renderizado com dados
  // atuais sem exigir F5.
  if (target === 'evidence') {
    safeCall(renderClientEvidence);
  } else if (target === 'self') {
    safeCall(renderClientSelfAssessment);
    safeCall(refreshClientSelfEvidencePickers);
  } else if (target === 'reports') {
    safeCall(renderClientDeliverablesPreview);
  } else if (target === 'plan') {
    safeCall(renderClientPlanPreview);
  } else if (target === 'seal') {
    safeCall(renderClientSealPreview);
  }
}

/* ========================================================================== */
/* Render — Cliente (KPIs + evidências)                                        */
/* ========================================================================== */

function renderClientKPIs() {
  try {
    const k = dashStore.computeKPIs?.();
    if (!k) return;

    setText($id('home-kpi-pendentes'), k.pendentes ?? '—');
    setText($id('home-kpi-conformes'), k.conformes ?? '—');
    setText($id('home-kpi-pontos'), k.pontos ?? '—');

    // Mini KPI updates for lacuna counts (E/S/G) removed with hero section cleanup
  } catch (err) {
    console.warn('[dashboard] KPIs cliente:', err);
  }
}

/**
 * Renderiza lista de evidências com estado vazio consistente.
 * @param {HTMLElement|null} listEl
 * @param {any[]} items
 * @param {{ emptyText?: string, mode?: 'client'|'auditor' }} [opts]
 */
function renderClientEvidence() {
  PILLARS.forEach((pillar) => {
    const listEl = $id(`client-evidence-list-${pillar}`);
    if (!listEl) return;
    const items = dashStore.getEvidencesByPillar?.(pillar) || [];
    renderEvidenceList(listEl, items, { mode: 'client' });
  });
}

/* ========================================================================== */
/* Bind — Evidências: upload                                                   */
/* ========================================================================== */

function bindEvidenceUploadEvents() {
  if (_boundEvidenceUploads) return;
  _boundEvidenceUploads = true;

  document.addEventListener('change', async (e) => {
    const input = e.target?.closest?.('input.evidence-input[type="file"]');
    if (!input) return;

    if (input.dataset.ncsBusy === 'true') return;
    input.dataset.ncsBusy = 'true';

    const pillar = normalizePillar(input.dataset.pillar || 'G');
    const files = Array.from(input.files || []);
    input.value = '';

    if (!files.length) {
      input.dataset.ncsBusy = 'false';
      return;
    }

    // Garante existência de processo antes do upload
    await ensureActiveProcess();

    // Feedback imediato de envio
    showToast('Enviando evidências…', 'info');

    let savedCount = 0;

    try {
      for (const file of files) {
        let ev = null;

        try {
          ev = await backendAdapter.addEvidence(pillar, {
            name: file.name,
            size: file.size,
            type: file.type,
          });
        } catch (err) {
          console.warn('[dashboard] addEvidence:', err);
          showToast('Falha ao registrar evidência.', 'error');
          continue;
        }

        if (!ev?.id) {
          showToast('Falha ao registrar evidência (sem id).', 'error');
          continue;
        }

        try {
          const metaCompleto = {
            id: ev.id,
            evidenceId: ev.id,
            pillar,
            name: file.name,
            filename: file.name,
            size: file.size,
            type: file.type,
            createdAt: new Date().toISOString(),
          };
          await backendAdapter.saveEvidenceFile(ev.id, file, metaCompleto);
        } catch (err) {
          console.warn('[dashboard] saveEvidenceFile:', err);
          showToast('Falha ao salvar a evidência.', 'error');
          continue;
        }

        savedCount += 1;
        safeCall(() => backendAdapter.log('add-evidence', { evidenceId: ev.id, pillar, name: file.name }));
      }
    } finally {
      // Após uploads, recarrega contexto completo para refletir processo, evidências e indicadores
      try {
        await loadClientContext();
      } catch {
        // noop: caso a recarga falhe, usamos renderização anterior
      }
      safeCall(renderClientEvidence);
      safeCall(refreshClientSelfEvidencePickers);

      if (savedCount > 0) {
        showToast(savedCount === 1 ? 'Evidência salva' : 'Evidências salvas', 'success');
      }
      input.dataset.ncsBusy = 'false';
    }
  });

  // Botões CTA de upload: dispara clique no input correspondente
  document.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('[data-action="client-evidence-select"]');
    if (!btn) return;
    ev.preventDefault();
    const pillar = btn.dataset.pillar || '';
    const inputEl = document.getElementById(`client-evidence-input-${pillar}`);
    if (inputEl) {
      inputEl.click();
    }
  });
}

/* ========================================================================== */
/* Cliente — Autoavaliação (render + bind)                                     */
/* ========================================================================== */

function getClientAnnouncer() {
  return $id('client-dashboard-announcer');
}

function announceClient(message) {
  const el = getClientAnnouncer();
  if (!el) return;
  el.textContent = String(message || '');
}

function getClientIndicatorsForSelf(limit = CLIENT_SELF_LIMIT) {
  const list = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  return list.slice(0, Math.max(0, Number(limit) || CLIENT_SELF_LIMIT));
}

function ensureIndicatorSelf(ind) {
  if (!ind) return { answer: '', note: '', evidenceIds: [] };

  if (!ind.self || typeof ind.self !== 'object') {
    ind.self = { answer: '', note: '', evidenceIds: [], updatedAt: null };
  }
  if (typeof ind.self.answer !== 'string') ind.self.answer = '';
  if (typeof ind.self.note !== 'string') ind.self.note = '';
  if (!Array.isArray(ind.self.evidenceIds)) ind.self.evidenceIds = [];
  return ind.self;
}

function getEvidenceListForIndicator(ind) {
  const all = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  const pillar = normalizePillar(ind?.pillar);
  return all.filter((e) => e && normalizePillar(e.pillar) === pillar);
}

function buildSelfNotePlaceholder(answer) {
  return answer === 'Não'
    ? 'Descreva o gap (o que falta, impacto e próximo passo)…'
    : answer === 'N/A'
      ? 'Justifique a não aplicabilidade (por que não se aplica ao seu contexto)…'
      : 'Opcional: contexto e referência interna (política, procedimento, responsável)…';
}

function updateSelfRowHint(ind, hintEl, answer, self, evList) {
  if (!hintEl) return;

  const a = String(answer || '').trim();
  const note = String(self?.note || '').trim();
  const evCount = Array.isArray(self?.evidenceIds) ? self.evidenceIds.length : 0;

  let msg = '';
  if (!a) msg = 'Selecione Sim, Não ou N/A.';
  else if (a === 'Sim' && (evList?.length || 0) > 0 && evCount < 1) msg = 'Sugestão: vincule ao menos 1 evidência.';
  else if (a === 'Não' && note.length < 10) msg = 'Descreva brevemente o gap (mín. ~1 frase).';
  else if (a === 'N/A' && note.length < 10) msg = 'Justifique por que não se aplica (mín. ~1 frase).';
  else msg = '—';

  hintEl.textContent = msg;
}

function renderClientSelfAssessment() {
  const container = $id('client-self-assessment');
  if (!container) return;

  safeCall(() => {
    if (typeof dashStore.ensureSelfAssessmentShape === 'function') dashStore.ensureSelfAssessmentShape();
  });

  const indicators = getClientIndicatorsForSelf(CLIENT_SELF_LIMIT);
  // Generate HTML via pure renderer with all evidences (for the limit of 12 indicators)
  const evidences = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  // Compose the HTML string using the pure renderer.  This avoids
  // constructing the markup imperatively here and ensures deterministic
  // output.  The pure renderer handles grouping and answer/select
  // generation internally.
  const html = pureRenderClientSelfAssessmentHtml(indicators, evidences);
  container.innerHTML = html;

  // After injecting the HTML, update the row hints based on current
  // answers, notes and evidence counts.  We reuse ensureIndicatorSelf()
  // and updateSelfRowHint() from the legacy code.
  const sortedIndicators = indicators.slice().sort(sortByPillarThenCode);
  sortedIndicators.forEach((ind) => {
    const self = ensureIndicatorSelf(ind);
    const currentAnswer = String(self.answer || '').trim();
    const evListForHint = getEvidenceListForIndicator(ind);
    const indId = String(ind.id ?? '');
    const hintEl = container.querySelector('[data-hint-for="' + cssEscape(indId) + '"]');
    updateSelfRowHint(ind, hintEl, currentAnswer, self, evListForHint);
  });

  // End of render function.  No further imperative DOM construction is
  // needed here; event handlers for inputs are bound elsewhere.
}

function refreshClientSelfEvidencePickers() {
  const container = $id('client-self-assessment');
  if (!container) return;

  const indicators = getClientIndicatorsForSelf(CLIENT_SELF_LIMIT);
  const indById = new Map(indicators.map((i) => [String(i?.id), i]));

  const rows = container.querySelectorAll('tr[data-indicator-id]');
  rows.forEach((row) => {
    const indicatorId = String(row.dataset.indicatorId || '');
    const ind = indById.get(indicatorId);
    if (!ind) return;

    const self = ensureIndicatorSelf(ind);
    const evList = getEvidenceListForIndicator(ind);

    const evSelect = row.querySelector('select.self-evidence');
    const evMini = row.querySelector(`[data-ev-count-for="${cssEscape(indicatorId)}"]`);
    const hint = row.querySelector(`[data-hint-for="${cssEscape(indicatorId)}"]`);
    const answerSelect = row.querySelector('select.self-answer');

    if (!evSelect) return;

    const selected = new Set((self.evidenceIds || []).map(String));
    // Gera options via template string ao invés de criar elementos imperativos
    let optionsHtml = '';
    if (!evList.length) {
      // Estado vazio: nenhuma evidência no pilar
      optionsHtml = '<option value="" disabled selected>(Sem evidências disponíveis neste pilar)</option>';
    } else {
      optionsHtml = evList
        .map((ev) => {
          const evId = String(ev.id);
          const selectedAttr = selected.has(evId) ? ' selected' : '';
          const evName = ev && ev.name ? String(ev.name) : `Evidência ${ev.id}`;
          return (
            '<option value="' +
            escapeHtml(evId) +
            '"' +
            selectedAttr +
            '>' +
            escapeHtml(evName) +
            '</option>'
          );
        })
        .join('');
    }
    evSelect.innerHTML = optionsHtml;

    const n = Array.isArray(self.evidenceIds) ? self.evidenceIds.length : 0;
    if (evMini) evMini.textContent = n ? `${n} vinculada(s)` : 'Nenhuma vinculada';

    updateSelfRowHint(ind, hint, answerSelect?.value || self.answer, self, evList);
  });
}

/* ========================================================================== */
/* Perfil do participante — helpers, renderização e gating                        */
/* ========================================================================== */

/**
 * Obtém o objeto de perfil do processo atual de forma defensiva.  Sempre
 * retorna um objeto com as propriedades org, esg e meta para evitar
 * undefined.  Quando o payload.profile não existir, retorna estruturas
 * vazias.  Este helper facilita a leitura do estado salvo.
 * @returns {{ org: object, esg: object, meta: object }}
 */
function getProfileFromProcess() {
  const proc = dashStore.state?.process || {};
  const payload = proc?.payload || {};
  const profile = payload?.profile || {};
  const org = profile?.org && typeof profile.org === 'object' ? { ...profile.org } : {};
  const esg = profile?.esg && typeof profile.esg === 'object' ? { ...profile.esg } : {};
  const meta = profile?.meta && typeof profile.meta === 'object' ? { ...profile.meta } : {};
  return { org, esg, meta };
}

/**
 * Lê os valores do formulário de perfil (#client-profile-form) e constrói
 * um objeto de perfil com as propriedades org, esg e meta.  O campo
 * meta.updatedAt é definido no momento da leitura.  Missão, visão e
 * valores são armazenados dentro de org para simplificar o schema.
 * @returns {{ org: object, esg: object, meta: object }}
 */
function readProfileForm() {
  const profile = { org: {}, esg: {}, meta: {} };
  // Always use FormData-based reading for the profile form.  The helper
  // getFormObject() returns an object keyed by input names allowing
  // straightforward extraction without directly referencing element IDs.
  const formObj = getFormObject('client-profile-form');
  const keys = [
    'legalName',
    'tradeName',
    'cnpj',
    'cnaeMain',
    'cnaeSecondary',
    'city',
    'uf',
    'site',
    'contactName',
    'contactEmail',
    'contactPhone',
    'size',
    'headcount',
    'revenue',
    'sector',
    'mission',
    'vision',
    'values',
  ];
  const org = {};
  keys.forEach((k) => {
    const v = formObj && Object.prototype.hasOwnProperty.call(formObj, k) ? formObj[k] : '';
    org[k] = typeof v === 'string' ? v.trim() : v;
  });
  profile.org = org;
  // Extract answers for ESG questions using the FormData object.  For each
  // question id, read the corresponding name ("esg-<id>") from the
  // formObj.  If no value exists or it's not a string, default to
  // an empty string.  Always trim the resulting string to remove
  // incidental whitespace from the input.
  PROFILE_QUESTIONS_V1.forEach((q) => {
    const key = 'esg-' + q.id;
    let val = '';
    if (formObj && Object.prototype.hasOwnProperty.call(formObj, key)) {
      const raw = formObj[key];
      if (typeof raw === 'string') {
        val = raw.trim();
      } else if (raw != null) {
        val = String(raw).trim();
      }
    }
    profile.esg[q.id] = val;
  });
  profile.meta = {
    ...profile.meta,
    updatedAt: new Date().toISOString(),
    version: 'v1',
  };
  return profile;
}


/**
 * Valida o perfil fornecido retornando uma lista de campos ou perguntas
 * pendentes.  Campos obrigatórios devem ter valor não vazio; perguntas
 * obrigatórias devem ter resposta diferente de string vazia.  Quando
 * completo, a lista retornada é vazia.
 * @param {{ org: object, esg: object }} profile
 * @returns {string[]} Lista de pendências (ids de campo ou pergunta)
 */
function validateProfile(profile) {
  const missing = [];
  const o = profile?.org || {};
  const requiredFields = [
    'legalName',
    'cnpj',
    'cnaeMain',
    'city',
    'uf',
    'contactName',
    'contactEmail',
    'contactPhone',
    'size',
    'headcount',
    'revenue',
    'sector',
    'mission',
    'vision',
    'values',
  ];
  requiredFields.forEach((f) => {
    const v = String(o?.[f] || '').trim();
    if (!v) missing.push(f);
  });
  const esg = profile?.esg || {};
  PROFILE_QUESTIONS_V1.forEach((q) => {
    const v = String(esg?.[q.id] || '').trim();
    if (!v) missing.push(q.id);
  });
  return missing;
}

function isProfileComplete(profile) {
  return Array.isArray(validateProfile(profile)) && validateProfile(profile).length === 0;
}

/**
 * Persiste um patch do processo atual ao backend sem sobrescrever
 * propriedades existentes.  Faz merge do processo existente com o
 * patch e atualiza o campo updatedAt.  Substitui dashStore.state.process
 * após retorno do backend.  Se o processo não estiver carregado, não faz
 * nada.
 * @param {object} patch
 */
async function persistProcessPatch(patch) {
  await ensureActiveProcess();
  const proc = dashStore.state?.process;
  if (!proc || !proc.id) return;
  const next = { ...proc, ...patch, id: proc.id, company: proc.company };
  next.updatedAt = new Date().toISOString();
  try {
    await upsertProcessSubmission?.(next);
    dashStore.state.process = next;
  } catch (err) {
    console.warn('[client] persistProcessPatch:', err);
  }
}

function renderClientProfile() {
  const cont = document.getElementById('client-profile-form');
  if (!cont) return;
  const { org, esg } = getProfileFromProcess();
  // Prepare a mapping for ESG radio fields keyed by `esg-<id>`.  Use trimmed
  // strings as values and default to empty string when absent.
  const esgValues = {};
  PROFILE_QUESTIONS_V1.forEach((q) => {
    const val = esg && Object.prototype.hasOwnProperty.call(esg, q.id) ? esg[q.id] : '';
    esgValues['esg-' + q.id] = typeof val === 'string' ? val.trim() : String(val || '').trim();
  });
  // Merge organization fields with ESG radio values.  Fill the form before
  // rendering questions; this will populate basic input fields.  Radio
  // buttons will be populated after they are inserted into the DOM.
  const data = { ...(org || {}), ...esgValues };
  fillForm('client-profile-form', data);
  const qContainer = document.getElementById('client-profile-questions');
  if (qContainer) {
    // Render all profile questions via a single template string.  This avoids
    // repeated DOM manipulations while preserving names, ids and labels.
    const labelMap = { yes: 'Sim', no: 'Não', partial: 'Em implementação', na: 'N/A' };
    function renderQuestion(q) {
      // Generate radio inputs without manually marking them as checked; the
      // subsequent call to fillForm() will handle setting the checked
      // property based on the esgValues mapping.
      const optionsHtml = q.opts
        .map((opt) => {
          const labelText = labelMap[opt] || opt;
          return `<label class="radio"><input type="radio" name="esg-${q.id}" value="${opt}" id="profile-${q.id}-${opt}"><span>${escapeHtml(labelText)}</span></label>`;
        })
        .join('');
      return `<div class="form-group"><label class="question-text">${escapeHtml(q.text)}</label><div class="radio-options">${optionsHtml}</div></div>`;
    }
    qContainer.innerHTML = PROFILE_QUESTIONS_V1.map(renderQuestion).join('');
    // After injecting the ESG questions, call fillForm again on the ESG values
    // to mark the appropriate radio buttons.  Without this second call
    // fillForm would have executed before the radio inputs existed.
    fillForm('client-profile-form', esgValues);
  }
  applyProfileGating();
}

function applyProfileGating() {
  const { org, esg, meta } = getProfileFromProcess();
  const profile = { org, esg, meta };
  const missing = validateProfile(profile);
  const complete = missing.length === 0;
  const statusEl = document.getElementById('client-profile-status');
  const progressEl = document.getElementById('client-profile-progress');
  if (statusEl) {
    // Bind the status text via view-model to keep UI consistent with micro-binding.
    const vm = { profileStatusText: complete ? 'Completo' : 'Incompleto' };
    // Use the status element as the root to avoid clearing unrelated bindings.
    bindText(statusEl, vm);
    // Maintain existing classes for success/error chips.
    statusEl.classList.toggle('chip-success', complete);
    statusEl.classList.toggle('chip-error', !complete);
  }
  if (progressEl) {
    const answered = PROFILE_QUESTIONS_V1.reduce((acc, q) => {
      return acc + (String(esg?.[q.id] || '').trim() ? 1 : 0);
    }, 0);
    const total = PROFILE_QUESTIONS_V1.length;
    progressEl.textContent = `${answered}/${total} respondidas`;
  }
  const submitBtn = document.querySelector('[data-action="client-submit"]');
  const hintEl = document.getElementById('client-submit-hint');
  const declarationIds = [
    'client-declare-minimum',
    'client-declare-truth',
    'client-declare-no-consultancy',
    'client-accept-terms',
    'client-declare-third-party',
  ];
  if (!complete) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-disabled', 'true');
    }
    if (hintEl) hintEl.textContent = 'Complete o Perfil para habilitar a submissão.';
    declarationIds.forEach((id) => {
      const cb = document.getElementById(id);
      if (cb) {
        cb.disabled = true;
        cb.setAttribute('aria-disabled', 'true');
      }
    });
  } else {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.setAttribute('aria-disabled', 'false');
    }
    if (hintEl) hintEl.textContent = '';
    declarationIds.forEach((id) => {
      const cb = document.getElementById(id);
      if (cb) {
        cb.disabled = false;
        cb.setAttribute('aria-disabled', 'false');
      }
    });
  }
  // Removida a desativação de seções do dashboard quando o perfil está incompleto.
  // Sempre habilita os botões de navegação independentemente do status do perfil.
  const blockedSections = ['evidence', 'self', 'reports', 'plan', 'seal', 'audit'];
  blockedSections.forEach((sec) => {
    const btn = document.querySelector(`[data-action="client-switch-section"][data-section="${sec}"]`);
    if (btn) {
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', 'false');
      btn.setAttribute('tabindex', '0');
      btn.classList.remove('disabled');
    }
  });
}

function bindClientProfileEvents() {
  const form = document.getElementById('client-profile-form');
  if (!form || form.__ncsBound) return;
  form.__ncsBound = true;
  const saveBtn = document.getElementById('client-profile-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const nextProfile = readProfileForm();
      const missing = validateProfile(nextProfile);
      const hint = document.getElementById('client-profile-hint');
      if (missing.length > 0) {
        if (hint) hint.textContent = 'Preencha todos os campos obrigatórios para salvar.';
        showToast('warning', 'Campos obrigatórios pendentes.');
      }
      try {
        await persistProcessPatch({ payload: { ...dashStore.state?.process?.payload, profile: nextProfile } });
        const current = getProfileFromProcess();
        const nowComplete = isProfileComplete(nextProfile);
        if (nowComplete && !current.meta?.completedAt) {
          const updated = { ...nextProfile, meta: { ...(nextProfile.meta || {}), completedAt: new Date().toISOString() } };
          await persistProcessPatch({ payload: { ...dashStore.state?.process?.payload, profile: updated } });
        }
        if (hint) hint.textContent = nowComplete ? '' : hint.textContent;
        showToast('success', 'Perfil salvo.');
        dashStore.state.process = { ...dashStore.state.process, payload: { ...dashStore.state.process?.payload, profile: nextProfile } };
        applyProfileGating();
        if (isProfileComplete(nextProfile)) {
          switchClientSection('overview');
        }
      } catch (err) {
        console.warn('[client] Falha ao salvar perfil:', err);
        showToast('error', 'Falha ao salvar perfil.');
      }
    });
  }
  form.addEventListener('input', () => {
    applyProfileGating();
  });
  form.addEventListener('change', () => {
    applyProfileGating();
  });
}

function renderClientIndicatorsOverview() {
  const cont = document.getElementById('client-indicators-overview');
  if (!cont) return;
  const list = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators.slice() : [];
  // Usa renderização baseada em template: gera HTML completo e injeta
  // Use the pure renderer imported from client_renderers.js.  This
  // produces deterministic HTML and reduces duplication of template code.
  cont.innerHTML = pureRenderClientIndicatorsOverviewHtml(list);
}

/**
 * Gera o HTML do resumo de indicadores do ciclo.  Esta função produz
 * um markup completo usando template strings e garante escape de
 * conteúdo interpolado via escapeHtml().  Quando a lista de
 * indicadores estiver vazia, retorna um estado vazio consistente.
 *
 * @param {any[]} indicators Lista de indicadores a serem renderizados.
 * @returns {string} HTML para o resumo de indicadores.
 */

/* ========================================================================== */
/* Render — Entregas, Plano de ação e Selo                                      */
/* ========================================================================== */

/**
 * Gera o preview do sumário executivo para a aba "Entregas".  Utiliza
 * generateExecutiveSummaryHTML() passando um snapshot real contendo
 * processo, indicadores e evidências.  O HTML gerado é injetado em
 * #client-deliverables-preview.
 */
function renderClientDeliverablesPreview() {
  const cont = $id('client-deliverables-preview');
  if (!cont) return;
  const proc = dashStore.state?.process || null;
  const indicators = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const evidences = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  const snapshot = { processes: proc ? [proc] : [], indicators, evidences };
  let html = '';
  try {
    html = generateExecutiveSummaryHTML?.(snapshot) || '';
  } catch (err) {
    console.warn('[client] sumário preview:', err);
    html = '';
  }
  cont.innerHTML = html || '';
}

/**
 * Renderiza o preview do Plano de Ação na guia "Plano".  Quando há
 * indicadores carregados, passa processo e indicadores para
 * generateActionPlanHTML(); caso contrário, renderiza o modelo vazio.
 * O conteúdo é inserido em #client-plan-preview.
 */
function renderClientPlanPreview() {
  const cont = document.getElementById('client-plan-preview');
  if (!cont) return;
  const proc = dashStore.state?.process || null;
  const indicators = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const evidences = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  const snapshot = { processes: proc ? [proc] : [], indicators, evidences };
  let html = '';
  try {
    html = generateActionPlanHTML?.({ process: proc, indicators, snapshot }) || '';
  } catch (err) {
    console.warn('[client] plano preview:', err);
    html = '';
  }
  cont.innerHTML = html || '';
}

/**
 * Renderiza o preview do Selo/Certificado na guia "Selo".  O modelo
 * sempre é mostrado, mas o botão de download só é habilitado quando o
 * processo está no status "Validado".  A função atualiza o conteúdo
 * de #client-seal-card e os atributos de #client-seal-download-btn e
 * #client-seal-download-hint.
 */
function renderClientSealPreview() {
  const cont = document.getElementById('client-seal-card');
  if (!cont) return;
  const proc = dashStore.state?.process || null;
  const indicators = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const evidences = Array.isArray(dashStore.state?.evidences) ? dashStore.state.evidences : [];
  const snapshot = { processes: proc ? [proc] : [], indicators, evidences };
  let html = '';
  try {
    html = generateSealCertificateHTML?.({ process: proc, snapshot }) || '';
  } catch (err) {
    console.warn('[client] selo preview:', err);
    html = '';
  }
  cont.innerHTML = html || '';

  // Controla estado do botão de download de selo
  const btn = document.getElementById('client-seal-download-btn');
  const hintEl = document.getElementById('client-seal-download-hint');
  const statusRaw = String(proc?.status || '').toLowerCase();
  const isValid = statusRaw.includes('validado');
  if (btn) {
    btn.disabled = !isValid;
    btn.setAttribute('aria-disabled', isValid ? 'false' : 'true');
  }
  if (hintEl) {
    hintEl.textContent = isValid ? '' : 'Disponível após validação.';
  }
}

/* ========================================================================== */
/* Bind — Autoavaliação (delegado + debounce)                                  */
/* ========================================================================== */

function bindClientSelfAssessmentEvents() {
  const container = $id('client-self-assessment');
  if (!container || container.__ncsBound) return;
  container.__ncsBound = true;

  const noteTimers = new Map();

  function flushNote(indicatorId, value) {
    if (backendAdapter.updateSelfNote) {
      safeCall(() => backendAdapter.updateSelfNote(indicatorId, value));
    }
  }

  function scheduleNoteSave(indicatorId, value) {
    const key = String(indicatorId);
    if (noteTimers.has(key)) window.clearTimeout(noteTimers.get(key));
    noteTimers.set(
      key,
      window.setTimeout(() => {
        flushNote(indicatorId, value);
        noteTimers.delete(key);
      }, NOTE_DEBOUNCE_MS)
    );
  }

  container.addEventListener('change', (e) => {
    if (e?.defaultPrevented) return;

    const sel = e.target?.closest?.('select.self-answer');
    if (!sel) return;

    const indicatorId = sel.dataset.indicatorId;
    const answer = sel.value;

    if (backendAdapter.updateSelfAnswer) {
      safeCall(() => backendAdapter.updateSelfAnswer(indicatorId, answer));
    }

    const row = sel.closest('tr');
    const ta = row?.querySelector('textarea.self-note');
    if (ta) ta.placeholder = buildSelfNotePlaceholder(answer);

    const ind = getClientIndicatorsForSelf(CLIENT_SELF_LIMIT).find((x) => String(x?.id) === String(indicatorId));
    if (ind) {
      const self = ensureIndicatorSelf(ind);
      const evList = getEvidenceListForIndicator(ind);
      const hint = row?.querySelector(`[data-hint-for="${cssEscape(indicatorId)}"]`);
      updateSelfRowHint(ind, hint, answer, self, evList);
    }

    announceClient('Resposta da autoavaliação atualizada.');
  });

  container.addEventListener('input', (e) => {
    const ta = e.target?.closest?.('textarea.self-note');
    if (!ta) return;
    scheduleNoteSave(ta.dataset.indicatorId, ta.value);
  });

  container.addEventListener(
    'blur',
    (e) => {
      const ta = e.target?.closest?.('textarea.self-note');
      if (!ta) return;

      const indicatorId = ta.dataset.indicatorId;
      flushNote(indicatorId, ta.value);

      const row = ta.closest('tr');
      const ind = getClientIndicatorsForSelf(CLIENT_SELF_LIMIT).find((x) => String(x?.id) === String(indicatorId));
      if (!ind) return;

      const self = ensureIndicatorSelf(ind);
      const evList = getEvidenceListForIndicator(ind);
      const answerSel = row?.querySelector('select.self-answer');
      const hint = row?.querySelector(`[data-hint-for="${cssEscape(indicatorId)}"]`);
      updateSelfRowHint(ind, hint, answerSel?.value || self.answer, self, evList);
    },
    true
  );

  container.addEventListener('change', (e) => {
    const sel = e.target?.closest?.('select.self-evidence');
    if (!sel) return;

    const indicatorId = sel.dataset.indicatorId;
    const ids = Array.from(sel.selectedOptions || [])
      .map((o) => o.value)
      .filter((x) => x && x.trim());

    if (backendAdapter.updateSelfEvidenceIds) {
      safeCall(() => backendAdapter.updateSelfEvidenceIds(indicatorId, ids));
    }

    const row = sel.closest('tr');
    const mini = row?.querySelector(`[data-ev-count-for="${cssEscape(indicatorId)}"]`);
    if (mini) mini.textContent = ids.length ? `${ids.length} vinculada(s)` : 'Nenhuma vinculada';

    const ind = getClientIndicatorsForSelf(CLIENT_SELF_LIMIT).find((x) => String(x?.id) === String(indicatorId));
    if (ind) {
      const self = ensureIndicatorSelf(ind);
      const evList = getEvidenceListForIndicator(ind);
      const answerSel = row?.querySelector('select.self-answer');
      const hint = row?.querySelector(`[data-hint-for="${cssEscape(indicatorId)}"]`);
      updateSelfRowHint(ind, hint, answerSel?.value || self.answer, self, evList);
    }

    announceClient('Evidências vinculadas atualizadas.');
  });
}

/* ========================================================================== */
/* Bind — Navegação interna do cliente (tabs)                                  */
/* ========================================================================== */

function bindClientNavEvents() {
  const root = $id('client-full-dashboard');
  if (!root || root.__ncsNavBound) return;
  root.__ncsNavBound = true;

  function onActivate(btn) {
    const section = String(btn.dataset.section || '').trim();
    if (!section) return;
    switchClientSection(section);
    safeCall(() => backendAdapter.log('client-switch-section', { section }));
  }

  root.addEventListener('click', (e) => {
    if (e?.defaultPrevented) return;
    const btn = e.target?.closest?.('[data-action="client-switch-section"]');
    if (!btn) return;
    e.preventDefault();
    onActivate(btn);
  });

  root.addEventListener('keydown', (e) => {
    const btn = e.target?.closest?.('[data-action="client-switch-section"]');
    if (!btn) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onActivate(btn);
  });
}

/* ========================================================================== */
/* Persistência mínima de autoavaliação (backendAdapter overrides)             */
/*
 * As respostas, justificativas e vínculos de evidências da autoavaliação
 * devem ser persistidos no backend para que não se percam ao navegar entre
 * abas ou recarregar a página.  Este bloco adiciona métodos ao
 * `backendAdapter` (importado de shared.js) que atualizam o estado local
 * (dashStore.state.indicators) e disparam uma operação de upsert no
 * backend com debounce.  A operação de upsert utiliza o endpoint
 * `api.upsertProcessSubmission` com um objeto contendo o id do processo e
 * a lista de indicadores com suas propriedades `self` (answer, note,
 * evidenceIds, updatedAt).
 */

// Debounced persist function (usa o mesmo NOTE_DEBOUNCE_MS definido no topo)
// Debounced persist function (usa o mesmo NOTE_DEBOUNCE_MS definido no topo).
// Persiste indicadores via persistProcessPatch() para evitar sobrescrita de
// outras propriedades do processo (por exemplo, perfil).  Serializa apenas
// id e self para reduzir payload.
const _persistSelf = debounce(async () => {
  const proc = dashStore.state?.process;
  if (!proc || !proc.id) return;
  try {
    const indicators = Array.isArray(dashStore.state?.indicators)
      ? dashStore.state.indicators.map((ind) => ({ id: ind.id, self: ind.self || {} }))
      : [];
    await persistProcessPatch({ indicators });
  } catch (err) {
    console.warn('[client] Falha ao persistir autoavaliação:', err);
  }
}, NOTE_DEBOUNCE_MS);

// Override backendAdapter methods only when they exist
backendAdapter.updateSelfAnswer = async (indicatorId, answer) => {
  await ensureActiveProcess();
  const idStr = String(indicatorId);
  const list = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const ind = list.find((i) => String(i?.id) === idStr);
  if (!ind) return;
  const self = ensureIndicatorSelf(ind);
  self.answer = String(answer || '');
  self.updatedAt = new Date().toISOString();
  _persistSelf();
  // Atualiza resumo de indicadores
  safeCall(renderClientIndicatorsOverview);
};

backendAdapter.updateSelfNote = async (indicatorId, note) => {
  await ensureActiveProcess();
  const idStr = String(indicatorId);
  const list = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const ind = list.find((i) => String(i?.id) === idStr);
  if (!ind) return;
  const self = ensureIndicatorSelf(ind);
  self.note = String(note || '');
  self.updatedAt = new Date().toISOString();
  _persistSelf();
  safeCall(renderClientIndicatorsOverview);
};

backendAdapter.updateSelfEvidenceIds = async (indicatorId, ids) => {
  await ensureActiveProcess();
  const idStr = String(indicatorId);
  const list = Array.isArray(dashStore.state?.indicators) ? dashStore.state.indicators : [];
  const ind = list.find((i) => String(i?.id) === idStr);
  if (!ind) return;
  const self = ensureIndicatorSelf(ind);
  self.evidenceIds = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  self.updatedAt = new Date().toISOString();
  _persistSelf();
  safeCall(renderClientIndicatorsOverview);
};

/* ========================================================================== */
/* Init (Export)                                                               */
/* ========================================================================== */

/**
 * Inicializa dashboard do cliente (idempotente).
 * - Instala providers e binds necessários
 * - Carrega store (via DAL) e renderiza
 */
export function initClientDashboard() {
  if (!_clientInit) {
    _clientInit = true;
    installClientChatContextProvider();

    bindEvidenceActionEvents(); // global
    // Delegate navigation and evidence upload to the unified client actions
    // installer.  This call is idempotent and will no-op on subsequent
    // invocations.  We pass in the required callbacks and references.
    installClientActions({
      switchClientSection: switchClientSection,
      backendAdapter,
      ensureActiveProcess,
      loadClientContext,
      dashStore,
      renderClientEvidence,
      refreshClientSelfEvidencePickers,
    });
  }

  // Mostra mensagem de carregamento antes de buscar dados
  announceClient('Carregando painel do participante…');

  // Carrega dependências iniciais e, em seguida, hidrata o contexto do cliente. Somente
  // após a conclusão do carregamento renderizamos as seções para evitar
  // piscar de conteúdo "stub".  A promessa loadStoreOnce() prepara
  // adapters/drivers; loadClientContext() popula dashStore.state com
  // { process, indicators, evidences } reais.
  Promise.resolve(loadStoreOnce())
    .then(() => loadClientContext())
    .then(() => {
      // Limpa mensagem de carregamento
      announceClient('');
      safeCall(() => {
        if (typeof dashStore.ensureSelfAssessmentShape === 'function') dashStore.ensureSelfAssessmentShape();
      });

      // Atualiza nome da organização com fallback usando micro-binding
      const headerVm = { companyName: state?.session?.company || 'Sua Organização' };
      // Bind only the company name element to avoid interfering with other bindings
      bindText($id('client-company-name'), headerVm);

      // Executa demo (se disponível) após hidratação
      safeCall(() => applyClientDemo());

      // Renderiza KPIs, evidências e autoavaliação com base no contexto carregado
      safeCall(renderClientKPIs);
      safeCall(renderClientEvidence);
      safeCall(renderClientSelfAssessment);
      safeCall(bindClientSelfAssessmentEvents);
      safeCall(refreshClientSelfEvidencePickers);

      // Renderiza o perfil e aplica gating inicial
      safeCall(renderClientProfile);
      safeCall(bindClientProfileEvents);
      safeCall(applyProfileGating);
      // Renderiza resumo dos indicadores (12 linhas)
      safeCall(renderClientIndicatorsOverview);

      // Pre-render das abas de entregas, plano e selo para exibir previews
      safeCall(renderClientDeliverablesPreview);
      safeCall(renderClientPlanPreview);
      safeCall(renderClientSealPreview);
    })
    .catch(() => {
      // Em caso de falha, mostra aviso e renderiza estado mínimo
      announceClient('Falha ao carregar dados do painel. Verifique sua conexão e tente novamente.');
      showToast('Erro ao carregar dados do painel.', 'error');
      // fallback defensivo
      // Atualiza nome da organização usando micro-binding no cenário de falha
      const fallbackVm = { companyName: state?.session?.company || 'Sua Organização' };
      bindText($id('client-company-name'), fallbackVm);
      safeCall(renderClientKPIs);
      safeCall(renderClientEvidence);
    });
}

// Export helpers for use in other modules (e.g., actions.js)
export { getProfileFromProcess, validateProfile, isProfileComplete, persistProcessPatch, renderClientProfile, applyProfileGating, renderClientIndicatorsOverview };
// Export ensureActiveProcess para que outras partes da aplicação possam obter o
// processo corrente do cliente (ex.: ações de submissão).
export { ensureActiveProcess };
