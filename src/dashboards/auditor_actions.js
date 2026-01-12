/**
 * @file src/dashboards/auditor_actions.js
 * @module dashboards/auditor_actions
 *
 * Este módulo encapsula todas as lógicas de binding de eventos do
 * dashboard do avaliador.  Ao extrair as rotinas de binding para um
 * módulo dedicado, o arquivo principal do dashboard (auditor.js)
 * torna‑se significativamente menor e mais focado nas funções de
 * orquestração e carregamento de dados.  As funções de binding
 * contidas aqui não geram markup nem manipula diretamente estado
 * interno além de invocar callbacks fornecidos via injeção.
 *
 * A função principal exportada é `installAuditorActions`.  Ela recebe
 * um objeto de contexto com dependências necessárias (renderers,
 * helpers de atualização local, adaptador de backend, etc.) e
 * instala handlers de eventos no DOM apenas uma vez.  O módulo
 * mantém um mapa interno de motivos pendentes para a marcação “Não se
 * aplica” de indicadores, e define o tempo de debounce para notas.
 */

import { safeCall, $id } from './shared.js';

/**
 * Tempo de debounce (em milissegundos) utilizado ao salvar notas de
 * indicadores.  Esta constante é compartilhada com a implementação
 * original para preservar a experiência de usuário.
 *
 * @type {number}
 */
const NOTE_DEBOUNCE_MS = 600;

/**
 * Mapa interno que rastreia quando o avaliador marca um indicador como
 * “Não se aplica” mas ainda não forneceu um motivo na caixa de texto.
 * A chave do mapa é `${indicatorId}-${role}`.  Ao receber o motivo,
 * a entrada correspondente é removida.
 *
 * @type {Map<string, boolean>}
 */
const pendingNaReason = new Map();

/**
 * Instala todos os eventos do painel do avaliador.  Esta função deve
 * ser chamada a partir de `initAuditorDashboard()` e recebe via
 * argumento todas as dependências externas necessárias.  As funções
 * fornecidas permitem que este módulo permaneça desacoplado do
 * implementador e evitem dependências circulares.  A função não
 * devolve valor; todos os bindings são configurados via efeitos
 * colaterais.
 *
 * @param {object} opts
 * @param {function():void} opts.renderAuditorQueue Função que
 *   rederiza a fila de processos conforme o estado atual e filtros.
 * @param {function(string|number):void} opts.renderAuditorProcessDetail
 *   Função que rederiza o painel de detalhe de um processo específico.
 * @param {function(object=):void} opts.renderAuditorIndicators Função
 *   responsável por renderizar a tabela de indicadores.  Aceita um
 *   objeto opcional com propriedades como `restoreFocus`.
 * @param {function():void} opts.renderAuditorEvidenceGlobal Função
 *   que rederiza a lista de evidências em modo global (sem processo).
 * @param {function():void} opts.renderAuditorSlaSummary Função que
 *   rederiza o resumo de SLA no topo da dashboard.
 * @param {function(string,string,string):void} opts.updateIndicatorStatusLocal
 *   Função que atualiza o status de um indicador no estado local.
 *   Recebe (indicatorId, role, status).
 * @param {function(string,string,string):void} opts.updateIndicatorNoteLocal
 *   Função que atualiza a nota de um indicador no estado local.
 *   Recebe (indicatorId, role, note).
 * @param {function(string,object=):void} opts.setAuditorViewMode Função
 *   que alterna o modo de visualização (queue/detail/workspace).
 * @param {function():Promise<any>} opts.loadStoreOnce Função
 *   assíncrona que retorna a store inicial do auditor a partir do
 *   backend ou cache.
 * @param {function(object):void} opts.hydrateStore Função que
 *   recebe a store carregada e atualiza o estado interno do dashboard.
 * @param {any} opts.backendAdapter Adaptador de backend a ser usado
 *   para persistir modificações (status de indicadores, notas, etc.).
 */
export function installAuditorActions(opts = {}) {
  const {
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
  } = opts || {};

  /**
   * Limpa todos os filtros aplicados na fila do avaliador.  Esta
   * implementação itera sobre elementos com IDs conhecidos e define
   * seus valores como string vazia.  Quando um elemento não existir
   * simplesmente ignora.
   */
  function clearAuditorFilters() {
    const ids = [
      'auditor-filter-status',
      'auditor-filter-sla',
      'auditor-filter-city',
      'auditor-filter-sector',
      'auditor-filter-search',
    ];
    ids.forEach((id) => {
      const el = $id(id);
      if (!el) return;
      if ('value' in el) el.value = '';
    });
  }

  /**
   * Define handlers de clique e teclado na lista de processos.  Ao
   * selecionar um item (via click ou tecla Enter/Espaço) dispara a
   * renderização do detalhe do processo e registra o evento através
   * do backendAdapter.  Esta binding é aplicada apenas uma vez por
   * sessão para evitar múltiplas escutas.
   */
  function bindAuditorQueueEvents() {
    const listEl = $id('auditor-process-list');
    if (!listEl || listEl.__ncsBound) return;
    listEl.__ncsBound = true;

    function openFromItem(item) {
      const processId = String(item?.dataset?.id || '').trim();
      if (!processId) return;
      if (typeof renderAuditorProcessDetail === 'function') {
        renderAuditorProcessDetail(processId);
      }
      safeCall(() => {
        if (backendAdapter && typeof backendAdapter.log === 'function') {
          backendAdapter.log('auditor-open-process', { processId });
        }
      });
    }

    listEl.addEventListener('click', (e) => {
      if (e?.defaultPrevented) return;
      const item = e.target?.closest?.('[data-action="auditor-open-process"]');
      if (!item) return;
      e.preventDefault();
      openFromItem(item);
    });

    listEl.addEventListener('keydown', (e) => {
      const item = e.target?.closest?.('[data-action="auditor-open-process"]');
      if (!item) return;
      const key = e.key;
      if (key !== 'Enter' && key !== ' ') return;
      e.preventDefault();
      openFromItem(item);
    });
  }

  /**
   * Define listeners para todos os filtros da fila.  Sempre que um
   * filtro for alterado (change ou input), a fila será re-renderizada
   * usando a função fornecida em `renderAuditorQueue`.  A binding é
   * aplicada apenas uma vez para evitar múltiplas escutas.
   */
  function bindAuditorQueueFilterEvents() {
    const root = $id('auditor-full-dashboard') || document;
    if (!root || root.__ncsFilterBound) return;
    root.__ncsFilterBound = true;

    function hook(id, evt = 'change') {
      const el = $id(id);
      if (!el || el.__ncsBound) return;
      el.__ncsBound = true;
      el.addEventListener(evt, () => {
        if (typeof renderAuditorQueue === 'function') {
          safeCall(() => renderAuditorQueue());
        }
      });
    }

    hook('auditor-filter-status', 'change');
    hook('auditor-filter-sla', 'change');
    hook('auditor-filter-city', 'input');
    hook('auditor-filter-sector', 'input');
    hook('auditor-filter-search', 'input');
  }

  /**
   * Define listener genérico para ações declaradas via atributo
   * `data-action` dentro do dashboard do auditor.  Este delegador
   * lida apenas com um pequeno subconjunto de actions específicas do
   * painel (clear filters, back e refresh); outras actions são
   * despachadas pelo sistema global de actions.  A binding é
   * instalada apenas uma vez por sessão.
   */
  function bindAuditorActionEvents() {
    const root = $id('auditor-full-dashboard') || document;
    if (!root || root.__ncsActionsBound) return;
    root.__ncsActionsBound = true;

    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-action]');
      if (!btn) return;
      const action = String(btn.dataset.action || '');
      if (!action) return;

      if (action === 'auditor-clear-filters') {
        e.preventDefault();
        clearAuditorFilters();
        if (typeof renderAuditorQueue === 'function') renderAuditorQueue();
        return;
      }

      if (action === 'auditor-back') {
        e.preventDefault();
        if (typeof setAuditorViewMode === 'function') setAuditorViewMode('queue', { restoreFocus: true, restoreScroll: true });
        return;
      }

      if (action === 'auditor-refresh') {
        e.preventDefault();
        safeCall(async () => {
          if (typeof loadStoreOnce === 'function') {
            const store = await loadStoreOnce();
            if (typeof hydrateStore === 'function') hydrateStore(store);
            if (typeof renderAuditorQueue === 'function') renderAuditorQueue();
            if (typeof renderAuditorIndicators === 'function') renderAuditorIndicators();
            if (typeof renderAuditorEvidenceGlobal === 'function') renderAuditorEvidenceGlobal();
            if (typeof renderAuditorSlaSummary === 'function') renderAuditorSlaSummary();
          }
        });
        return;
      }
    });
  }

  /**
   * Define handlers para edição de indicadores.  Esta função registra
   * listeners em nível de grade (table) e lida com alterações de
   * status, notas e o fluxo de N/A.  O backend é atualizado via
   * backendAdapter.  O estado local é atualizado via funções
   * injectadas.
   */
  function bindIndicatorStatusEvents() {
    const grid = $id('auditor-indicators-grid');
    if (!grid || grid.__ncsBound) return;
    grid.__ncsBound = true;

    const noteTimers = new Map();

    function flushNote(indicatorId, role, value) {
      const id = String(indicatorId);
      const r = role === 'revisor' ? 'revisor' : 'principal';
      if (typeof updateIndicatorNoteLocal === 'function') updateIndicatorNoteLocal(id, r, value);

      const key = `${id}-${r}`;
      const isPendingNA = pendingNaReason.has(key);
      const reason = String(value || '').trim();

      // Se virou N/A, só confirma no backend quando existir motivo.
      if (isPendingNA) {
        if (!reason) return;
        pendingNaReason.delete(key);

        safeCall(() => {
          if (backendAdapter && typeof backendAdapter.updateIndicatorStatusRole === 'function') {
            backendAdapter.updateIndicatorStatusRole(id, r, 'Não se aplica', reason);
          }
          if (backendAdapter && typeof backendAdapter.updateIndicatorNoteRole === 'function') {
            backendAdapter.updateIndicatorNoteRole(id, r, reason);
          }
          if (backendAdapter && typeof backendAdapter.log === 'function') {
            backendAdapter.log('indicator-na-reason', { indicatorId: id, role: r });
          }
        });
        return;
      }

      safeCall(() => {
        if (backendAdapter && typeof backendAdapter.updateIndicatorNoteRole === 'function') {
          backendAdapter.updateIndicatorNoteRole(id, r, String(value ?? ''));
        }
      });
    }

    function scheduleNote(indicatorId, role, value) {
      const key = `${indicatorId}-${role}`;
      if (noteTimers.has(key)) window.clearTimeout(noteTimers.get(key));
      noteTimers.set(
        key,
        window.setTimeout(() => {
          flushNote(indicatorId, role, value);
          noteTimers.delete(key);
        }, NOTE_DEBOUNCE_MS)
      );
    }

    grid.addEventListener('input', (e) => {
      const ta = e.target?.closest?.('textarea[data-indicator-id]');
      if (!ta) return;
      scheduleNote(ta.dataset.indicatorId, ta.dataset.role || 'principal', ta.value);
    });

    grid.addEventListener(
      'blur',
      (e) => {
        const ta = e.target?.closest?.('textarea[data-indicator-id]');
        if (!ta) return;
        flushNote(ta.dataset.indicatorId, ta.dataset.role || 'principal', ta.value);
      },
      true
    );

    grid.addEventListener('change', (e) => {
      const select = e.target?.closest?.('select[data-indicator-id]');
      if (!select) return;

      const indicatorId = select.dataset.indicatorId;
      const role = select.dataset.role || 'principal';
      const status = select.value;

      // otimista em memória
      if (typeof updateIndicatorStatusLocal === 'function') updateIndicatorStatusLocal(indicatorId, role, status);

      if (status === 'Não se aplica') {
        const key = `${indicatorId}-${role === 'revisor' ? 'revisor' : 'principal'}`;
        pendingNaReason.set(key, true);
        // Quando marca N/A, troca para o campo de nota correspondente
        if (typeof renderAuditorIndicators === 'function') {
          renderAuditorIndicators({ restoreFocus: { indicatorId, role, field: 'note' } });
        }
        return;
      }

      safeCall(() => {
        if (backendAdapter && typeof backendAdapter.updateIndicatorStatusRole === 'function') {
          backendAdapter.updateIndicatorStatusRole(indicatorId, role, status, '');
        }
        if (backendAdapter && typeof backendAdapter.log === 'function') {
          backendAdapter.log('indicator-status', { indicatorId, role, status });
        }
      });

      if (typeof renderAuditorIndicators === 'function') {
        renderAuditorIndicators({ restoreFocus: { indicatorId, role, field: 'status' } });
      }
    });
  }

  // Instala todas as bindings.  Cada função verifica internamente se
  // já foi aplicada para evitar rebindings.  A ordem de chamada não
  // importa pois cada binding é idempotente.
  bindAuditorActionEvents();
  bindAuditorQueueEvents();
  bindAuditorQueueFilterEvents();
  bindIndicatorStatusEvents();
}