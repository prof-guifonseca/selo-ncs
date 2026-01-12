/**
 * @file src/actions/handlers.js
 * @module actions/handlers
 * @description Conjunto de handlers e utilidades para o dispatcher de ações.
 *
 * Este módulo centraliza todas as implementações de handlers que anteriormente
 * residiam em `src/actions/core.js`. Ele inclui helpers, funções utilitárias
 * e a tabela completa de handlers. A composição final de handlers é feita em
 * `src/actions/core.js`, que importa este módulo e os módulos de escopo
 * (common, client, auditor e admin) para agrupar as ações por perfil.
 */

// Budget: 1634 linhas — atualize ao modificar (evita inchaço)
/*
 * O conteúdo original de `src/actions/core.js` até a definição do
 * `handleAction` foi movido para este arquivo. Isso evita duplicação entre
 * `actions.js` e `actions/core.js` e permite que outros módulos importem
 * handlers específicos sem criar dependências circulares. Os comentários
 * originais foram preservados sempre que possível para manter o contexto.
 */

import { navigateTo } from '../router.js';
import { toggleMobileMenu, logout as navbarLogout } from '../navbar.js';

import * as ui from '../ui.js';
import * as clientDash from '../dashboards/client.js';
import * as auditorDash from '../dashboards/auditor.js';
import * as adminDash from '../dashboards/admin.js';

import * as chat from '../chat.js';
import * as audit from '../audit.js';
import * as report from '../report.js';
import * as deliverables from '../deliverables.js';
import * as api from '../services/api.js';

import { state } from '../state.js';

/* ==========================================================================
  Tipos (JSDoc)
============================================================================ */

/**
 * @typedef {'client'|'auditor'|'admin'|''} SessionRole
 */

/**
 * Payload comum do dispatcher de ações.
 * @typedef {Object} ActionContext
 * @property {string} action
 * @property {HTMLElement|null|undefined} el
 * @property {Event|null|undefined} event
 */

/**
 * @callback ActionHandler
 * @param {ActionContext} ctx
 * @returns {void|Promise<void>|any}
 */

/* ==========================================================================
  Constantes
============================================================================ */

const BLOB_REVOKE_MS = 10000;
// Tours feature removed. PENDING_TOUR_KEY is no longer used.

/* ==========================================================================
  Helpers base (anti-crash)
============================================================================ */

function safeCall(fn, fallback = null) {
  try {
    return fn();
  } catch (err) {
    console.warn('[actions] safeCall:', err);
    return fallback;
  }
}

function stop(event) {
  try {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  } catch {
    // noop
  }
}

/**
 * Toast compat: tenta ui.toast(), senão window.toast(), senão console.
 * @param {'success'|'info'|'warning'|'error'|string} type
 * @param {string} message
 */
function toast(type, message) {
  const t = String(type || 'info');
  const msg = String(message || '');
  const fn = ui?.toast || globalThis?.toast;
  if (typeof fn === 'function') return fn(t, msg);
  const tag = t.toUpperCase();
  console.log(`[${tag}] ${msg}`);
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function isoPlusDays(days) {
  const n = Number(days || 0);
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/**
 * Retorna o role da sessão corrente em forma normalizada.
 *
 * @returns {SessionRole}
 */
function getSessionRole() {
  try {
    const raw = String(state?.session?.role || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'gestor' || raw === 'operacao' || raw === 'operação' || raw === 'operation' || raw === 'ncs')
      return 'admin';
    if (raw === 'avaliador' || raw === 'reviewer') return 'auditor';
    if (raw === 'participante') return 'client';
    if (raw === 'admin' || raw === 'auditor' || raw === 'client') return /** @type {SessionRole} */ (raw);
    return 'client';
  } catch {
    return '';
  }
}

/**
 * Verifica se a sessão atual pertence a um auditor.
 *
 * @returns {boolean}
 */
function isAuditor() {
  return getSessionRole() === 'auditor';
}

/**
 * Obtém o ID do processo atualmente em foco para o avaliador.
 *
 * @returns {string}
 */
function getCurrentAuditorProcessId() {
  try {
    const st = api.getAppState?.();
    const pid = st?.currentAuditorProcessId;
    return pid ? String(pid) : '';
  } catch {
    return '';
  }
}

/**
 * Renderiza uma lista simples de entradas de audit log dentro de um
 * contêiner. Substitui o conteúdo existente e aplica data-empty quando vazio.
 *
 * @param {string} containerId ID do elemento (ex.: 'client-audit-timeline')
 * @param {any[]} items Lista de entradas retornadas pela API
 */
function renderAuditTimeline(containerId, items) {
  try {
    const el = document.getElementById(String(containerId || ''));
    if (!el) return;
    el.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
      el.dataset.empty = 'audit';
      el.textContent = 'Sem registros.';
      return;
    }
    delete el.dataset.empty;
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const div = document.createElement('div');
      // Usa occurred_at ou ts; aliases antigos (created_at) não são suportados.
      const tsRaw = item && (item.occurred_at || item.ts);
      let tsText = '';
      try {
        const d = tsRaw ? new Date(tsRaw) : null;
        tsText =
          d && !isNaN(d)
            ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : String(tsRaw || '');
      } catch {
        tsText = String(tsRaw || '');
      }
      // Usa event_type ou event; alias action foi descontinuado.
      const actionName = String(item && (item.event_type || item.event) || '').trim();
      div.textContent = `${tsText} — ${actionName || 'evento'}`;
      frag.appendChild(div);
    }
    el.appendChild(frag);
  } catch {
    // noop
  }
}

/**
 * Abre um URL em nova aba de maneira segura.
 * @param {string} url
 * @returns {boolean}
 */
function openUrlNewTab(url) {
  const u = String(url || '').trim();
  if (!u) return false;

  try {
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (w) return true;
  } catch {
    // noop
  }

  try {
    const a = document.createElement('a');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia texto para a área de transferência.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  const t = String(text || '');
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    // noop
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Mostra loading em um botão e executa callback; remove loading ao final.
 *
 * @param {HTMLElement|null|undefined} btn
 * @param {() => Promise<any>} fn
 */
async function withButtonLoading(btn, fn) {
  if (btn) {
    btn.setAttribute('data-loading', 'true');
    btn.setAttribute('disabled', 'true');
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.removeAttribute('data-loading');
      btn.removeAttribute('disabled');
    }
  }
}

/**
 * Atualiza as métricas de entrega no UI após geração de relatório.
 *
 * @param {string} kind Tipo de entrega (sumario, parecer, plano, html)
 */
function updateDeliverablesUI(kind) {
  try {
    const el = document.getElementById('deliverables-metadata');
    if (!el) return;
    const stamp = isoNow().split('T')[0] || '';
    const type = String(kind || '').toLowerCase();
    if (type === 'sumario') {
      el.dataset.summaryGeneratedAt = stamp;
    } else if (type === 'parecer') {
      el.dataset.opinionGeneratedAt = stamp;
    } else if (type === 'plano' || type === 'plan') {
      el.dataset.planGeneratedAt = stamp;
    } else {
      el.dataset.generalGeneratedAt = stamp;
    }
  } catch {
    // noop
  }
}

/**
 * Helpers de navegação.
 */
function navigateFromElement(el) {
  const view = el?.dataset?.view || 'landing';
  navigateTo(view);
}

function navigateScrollFromElement(el) {
  const view = el?.dataset?.view || 'landing';
  const anchor = el?.dataset?.scrollTarget;
  navigateTo(view, anchor);
}

/* ==========================================================================
  Handlers
============================================================================ */

// A tabela de handlers define o comportamento para cada data-action.  Ao
// modularizar, este objeto permanece a única fonte de verdade. Módulos
// específicos importam este objeto e extraem subconjuntos conforme
// necessário.
const handlers = {
  // Navegação
  navigate: async ({ el, event }) => {
    stop(event);
    navigateFromElement(el);
  },

  'navigate-view': async ({ el, event }) => {
    stop(event);
    navigateFromElement(el);
  },

  'navigate-scroll': async ({ el, event }) => {
    stop(event);
    navigateScrollFromElement(el);
  },

  scroll: async ({ el, event }) => {
    stop(event);
    const anchor = el?.dataset?.scrollTarget;
    const target = anchor ? document.getElementById(anchor) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Navbar
  'toggle-mobile-menu': async () => toggleMobileMenu(),
  logout: async () => navbarLogout(),

  // UI
  'toggle-password': async ({ el }) => safeCall(() => ui.togglePassword?.(el?.dataset?.target)),
  'switch-auth-tab': async ({ el }) => safeCall(() => ui.switchAuthTab?.(el?.dataset?.tab)),
  'open-modal': async ({ el }) => safeCall(() => ui.openModal?.(el?.dataset?.modal)),
  'close-modal': async () => safeCall(() => ui.closeModal?.()),
  // Tours removed: handlers for client-start-tour, auditor-start-tour and pitch-start-tour
  // were removed as part of tour deprecation.

  // Cliente
  'client-home': async ({ el }) => {
    const go = el?.dataset?.go;
    const map = { continue: 'overview', overview: 'overview', self: 'self' };
    safeCall(() => clientDash.showClientFullDashboard?.(map[go] || 'overview'));
  },

  'client-switch-section': async ({ el }) => {
    safeCall(() => clientDash.switchClientSection?.(el?.dataset?.section));
  },

  // CTA explícito de upload de evidências (seleciona e abre o input do pilar).
  // Este handler existe para que o atributo data-action="client-evidence-select"
  // não quebre o smoke test de ações.  A lógica de click sobre o input
  // também está implementada em dashboards/client.js para funcionar mesmo
  // sem o dispatcher.
  'client-evidence-select': async ({ el, event }) => {
    stop(event);
    try {
      const pillar = el?.dataset?.pillar || '';
      const inputEl = document.getElementById(`client-evidence-input-${pillar}`);
      if (inputEl) inputEl.click();
    } catch {
      // noop
    }
  },

  'client-cta': async ({ el }) => {
    const cta = el?.dataset?.cta;

    const actions = {
      submit: () => {
        // Normativo: após submissão, o dossiê fica bloqueado para edição e segue para revisão técnica e verificação independente.
        toast('info', 'Submissão iniciada. Após o envio, seu dossiê fica bloqueado. Aguarde a revisão técnica e a verificação independente. Você será notificado pelo painel.');
      },
      respond: () => {
        // Normativo: respondas devem ser enviadas no prazo estipulado (tipicamente 5 dias úteis) com fundamentação e evidência.
        toast('info', 'Modo de resposta ativado. Responda às solicitações dentro do prazo (5 dias úteis) e cite claramente a evidência que atende ao ponto.');
      },
      download: () => {
        safeCall(() => generateReportAndDownload({ role: 'client', type: 'html' }));
        // Normativo: o dossiê contém sumário executivo, parecer técnico e plano de ação.
        toast('success', 'Dossiê gerado. O arquivo inclui sumário executivo, parecer técnico e plano de ação para consulta interna.');
      },
      'go-evidence': () => safeCall(() => clientDash.showClientFullDashboard?.('evidence')),
      'go-self': () => safeCall(() => clientDash.showClientFullDashboard?.('self')),
      'go-submit': () => safeCall(() => clientDash.showClientFullDashboard?.('overview')),
    };

    const fn = actions[cta];
    if (!fn) return toast('warning', `Ação de cliente desconhecida: ${cta}`);
    fn();
  },

  // === Handlers exigidos pelo smoke (cliente) ===
  'client-ai': async ({ event }) => {
    stop(event);
    safeCall(() => chat.openChat?.());
  },

  'client-send-reply': async ({ event }) => {
    stop(event);
    safeCall(() => clientDash.showClientFullDashboard?.('overview'));
    toast('info', 'A área de resposta às devolutivas será exibida aqui (em implantação).');
  },

  'client-open-appeal': async ({ event }) => {
    stop(event);
    const fn = globalThis?.showAppealModal;
    if (typeof fn === 'function') {
      safeCall(() => fn());
      return;
    }
    const ok = safeCall(() => ui.openModal?.('appeal-modal'), false);
    if (!ok) toast('info', 'Canal de recurso/apelação ainda não está disponível neste build.');
  },

  'client-export-audit': async ({ el, event }) => {
    stop(event);
    const format = String(el?.dataset?.format || 'json').toLowerCase();
    const data = safeCall(() => audit.exportAuditLog?.(format), '') ?? '';
    const mime = format === 'csv' ? 'text/csv' : format === 'html' ? 'text/html' : 'application/json';
    const filename = format === 'csv' ? 'audit-log.csv' : format === 'html' ? 'audit-log.html' : 'audit-log.json';

    try {
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
      safeCall(() => audit.addAuditLog?.('export-audit', { role: 'client', format }));
      toast('success', 'Log de auditoria exportado.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao exportar log de auditoria.');
    }
  },

  // Pilot action: recarregar auditoria do cliente
  'client-refresh-audit': async ({ el, event }) => {
    stop(event);
    try {
      let pid = state?.session?.currentAuditorProcessId || '';
      if (!pid) {
        const procs = await api.listProcesses?.({ limit: 1 });
        if (Array.isArray(procs) && procs.length > 0) {
          pid = String(procs[0]?.id || '');
          if (pid) safeCall(() => api.setCurrentAuditorProcess?.(pid));
        }
      }
      if (!pid) {
        toast('warning', 'Nenhum processo encontrado para atualizar.');
        return;
      }

      await api.getProcessById?.(pid);

      try {
        const log = await api.getAuditLog?.(pid, { limit: 50 });
        renderAuditTimeline('client-audit-timeline', Array.isArray(log) ? log : []);
      } catch (err) {
        console.error(err);
        renderAuditTimeline('client-audit-timeline', []);
      }

      safeCall(() => audit.addAuditLog?.('client-refresh-audit', { processId: pid }));
      toast('success', 'Trilha de auditoria atualizada.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao atualizar a trilha de auditoria.');
    }
  },

  // Pilot action: auditor approves the latest submission for decision
  'auditor-approve-latest': async ({ el, event }) => {
    stop(event);
    try {
      const pid = state?.session?.currentAuditorProcessId || '';
      if (!pid) {
        toast('warning', 'Nenhum processo selecionado para aprovação.');
        return;
      }

      await api.submitProcessAction?.({ process_id: pid, action: 'approve' });

      await api.getProcessById?.(pid);
      toast('success', 'Processo marcado como pronto para decisão.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao aprovar o processo.');
    }
  },

  // Pilot action: auditor generates a preview of the public page
  'auditor-preview-public': async ({ el, event }) => {
    stop(event);
    try {
      const pid = state?.session?.currentAuditorProcessId || '';
      if (!pid) {
        toast('warning', 'Nenhum processo selecionado para pré-visualização.');
        return;
      }

      const html = await api.previewPublic?.(pid, 'html');
      if (!html || typeof html !== 'string') {
        toast('error', 'Falha ao gerar prévia da página pública.');
        return;
      }

      try {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        openUrlNewTab(url);
        setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
      } catch {
        const encoded = encodeURIComponent(html);
        openUrlNewTab(`data:text/html;charset=utf-8,${encoded}`);
      }

      toast('success', 'Pré-visualização aberta em nova aba.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao pré-visualizar página.');
    }
  },

  // Pilot action: auditor publishes the public page
  'auditor-publish': async ({ el, event }) => {
    stop(event);
    try {
      const pid = state?.session?.currentAuditorProcessId || '';
      if (!pid) {
        toast('warning', 'Nenhum processo selecionado para publicação.');
        return;
      }

      const res = await api.publishPublic?.(pid, { kind: 'validation' });
      const publicId = res?.public_id || res?.id || res?.slug || '';
      const url = res?.url || res?.public_url || '';
      if (!publicId || !url) {
        toast('error', 'Falha ao publicar página pública.');
        return;
      }

      toast('success', 'Página publicada com sucesso.');

      const preview = document.getElementById('auditor-public-preview');
      if (preview) {
        preview.innerHTML = `<p><strong>Publicado:</strong> <a href="${url}" target="_blank" rel="noopener">${publicId}</a></p>`;
      }
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao publicar página.');
    }
  },

  /* -----------------------------------------------------------------------
   * Admin onboarding (companies, memberships, processes)
   * --------------------------------------------------------------------- */

  'admin-memberships-refresh': async ({ el, event }) => {
    stop(event);
    await withButtonLoading(el, async () => {
      try {
        const companies = await api.listCompanies?.();

        const select = document.getElementById('admin-membership-company');
        if (select) {
          const firstOption = select.querySelector('option[value=""]');
          select.innerHTML = '';

          const opt0 = document.createElement('option');
          opt0.value = '';
          opt0.textContent = firstOption?.textContent || '(sem empresa / admin)';
          select.appendChild(opt0);

          if (Array.isArray(companies)) {
            for (const c of companies) {
              const id = c && (c.id || c.company_id || c.slug);
              const name = c && (c.name || c.company || c.slug || id);
              if (!id || !name) continue;
              const opt = document.createElement('option');
              opt.value = String(id);
              opt.textContent = String(name);
              select.appendChild(opt);
            }
          }
        }

        const companiesListEl = document.getElementById('admin-companies-list');
        if (companiesListEl) {
          companiesListEl.textContent = Array.isArray(companies) ? JSON.stringify(companies, null, 2) : '';
        }

        const memberships = await api.listMemberships?.();
        const membershipsListEl = document.getElementById('admin-memberships-list');
        if (membershipsListEl) {
          membershipsListEl.textContent = Array.isArray(memberships) ? JSON.stringify(memberships, null, 2) : '';
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao recarregar listas.');
      }
    });
  },

  'admin-create-company': async ({ el, event }) => {
    stop(event);
    const form = el?.closest('form') || document.getElementById('admin-create-company-form');
    const nameInput = form?.querySelector('#admin-company-name');
    const slugInput = form?.querySelector('#admin-company-slug');
    const resultEl = form?.querySelector('#admin-company-create-result') || document.getElementById('admin-company-create-result');
    const name = nameInput && typeof nameInput.value === 'string' ? nameInput.value.trim() : '';
    const slug = slugInput && typeof slugInput.value === 'string' ? slugInput.value.trim() : '';
    if (!name) {
      toast('warning', 'Nome da empresa é obrigatório.');
      return;
    }
    await withButtonLoading(el, async () => {
      try {
        const payload = { name };
        if (slug) payload.slug = slug;
        const res = await api.createCompany?.(payload);
        if (resultEl) {
          const out = res && typeof res === 'object' && 'company' in res ? res.company : res;
          resultEl.textContent = out ? JSON.stringify(out, null, 2) : '';
        }
        toast('success', 'Empresa criada com sucesso.');
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao criar empresa.');
      }
    });
    try {
      await handlers['admin-memberships-refresh']({ action: 'admin-memberships-refresh', el: null, event: null });
    } catch {
      // ignore
    }
  },

  /**
   * Resolve o ID de um usuário a partir do email informado no formulário de criação de vínculo.
   * A ação é acionada quando o gestor clica no botão “Buscar ID”.
   * Se o email estiver em branco ou for inválido, um toast de aviso será exibido.
   * Em caso de sucesso, o campo de ID é preenchido automaticamente e um
   * feedback positivo é mostrado. Quando o usuário não é encontrado, um
   * aviso claro informa a ausência.
   */
  'admin-resolve-user': async ({ el, event }) => {
    stop(event);
    // O elemento acionador deve ser o botão; usamos o mesmo botão para
    // exibir carregamento via withButtonLoading.
    const form = el?.closest('form') || document.getElementById('admin-create-membership-form');
    const emailInput = form?.querySelector('#admin-membership-email');
    const userInput = form?.querySelector('#admin-membership-user');
    const raw = emailInput && typeof emailInput.value === 'string' ? emailInput.value.trim() : '';
    if (!raw) {
      return toast('warning', 'Email é obrigatório.');
    }
    // Validação básica de formato (contém @ e ponto após o @).  Regex simples para evitar requisições inválidas.
    if (!/^.+@.+\..+$/.test(raw)) {
      return toast('warning', 'Email inválido.');
    }
    await withButtonLoading(el, async () => {
      try {
        const res = await api.resolveUserByEmail?.(raw);
        if (res && typeof res === 'object' && res.ok && res.user) {
          const id = res.user.id || res.user.user_id || '';
          if (id && userInput && typeof userInput.value === 'string') {
            userInput.value = String(id);
          }
          toast('success', 'Usuário encontrado.');
        } else {
          toast('warning', 'Usuário não encontrado.');
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao buscar usuário.');
      }
    });
  },

  'admin-create-membership': async ({ el, event }) => {
    stop(event);
    const form = el?.closest('form') || document.getElementById('admin-create-membership-form');
    const companySelect = form?.querySelector('#admin-membership-company');
    const userInput = form?.querySelector('#admin-membership-user');
    const roleSelect = form?.querySelector('#admin-membership-role');
    const activeInput = form?.querySelector('#admin-membership-active');
    const resultEl = form?.querySelector('#admin-membership-create-result') || document.getElementById('admin-membership-create-result');
    const companyId = companySelect && typeof companySelect.value === 'string' ? companySelect.value.trim() : '';
    const userId = userInput && typeof userInput.value === 'string' ? userInput.value.trim() : '';
    const role = roleSelect && typeof roleSelect.value === 'string' ? roleSelect.value.trim() : '';
    const isActive = activeInput ? !!activeInput.checked : true;

    if (!userId) return toast('warning', 'User ID é obrigatório.');
    if (!role) return toast('warning', 'Role é obrigatória.');
    if ((role === 'auditor' || role === 'client') && !companyId) {
      return toast('warning', 'Empresa é obrigatória para auditor ou client.');
    }

    const payload = { user_id: userId, role, is_active: isActive };
    if (companyId) payload.company_id = companyId;

    await withButtonLoading(el, async () => {
      try {
        const res = await api.createMembership?.(payload);
        if (resultEl) {
          const out = res && typeof res === 'object' && 'membership' in res ? res.membership : res;
          resultEl.textContent = out ? JSON.stringify(out, null, 2) : '';
        }
        toast('success', 'Membership criado com sucesso.');
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao criar membership.');
      }
    });

    try {
      await handlers['admin-memberships-refresh']({ action: 'admin-memberships-refresh', el: null, event: null });
    } catch {
      // ignore
    }
  },

  'admin-create-process': async ({ el, event }) => {
    stop(event);
    const form = el?.closest('form') || document.getElementById('admin-create-process-form');
    const companyInput = form?.querySelector('#admin-process-company');
    const resultEl = form?.querySelector('#admin-process-create-result') || document.getElementById('admin-process-create-result');
    const company = companyInput && typeof companyInput.value === 'string' ? companyInput.value.trim() : '';
    if (!company) return toast('warning', 'Empresa (company) é obrigatória.');

    // Conforme o backend, o campo owner_id é definido automaticamente a partir
    // da sessão (ownerId no payload será ignorado). Portanto, enviamos
    // apenas o nome da empresa.
    const payload = { company };

    await withButtonLoading(el, async () => {
      try {
        const out = await api.upsertProcessSubmission?.(payload);
        let processObj = null;
        if (out && typeof out === 'object') {
          if ('process' in out) processObj = out.process;
          else processObj = out;
        }
        const procId =
          processObj && (processObj.id || processObj.process_id || processObj.processId)
            ? (processObj.id || processObj.process_id || processObj.processId)
            : '';
        if (resultEl) {
          resultEl.textContent = procId ? String(procId) : processObj ? JSON.stringify(processObj, null, 2) : '';
        }
        toast('success', procId ? 'Processo criado com sucesso.' : 'Processo criado.');
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao criar processo.');
      }
    });
  },

  'admin-assign-auditors': async ({ el, event }) => {
    stop(event);
    const form = el?.closest('form') || document.getElementById('admin-assign-auditors-form');
    const processInput = form?.querySelector('#admin-assign-process');
    const principalInput = form?.querySelector('#admin-assign-principal');
    const reviewerInput = form?.querySelector('#admin-assign-reviewer');
    const resultEl = form?.querySelector('#admin-assign-result') || document.getElementById('admin-assign-result');
    const processId = processInput && typeof processInput.value === 'string' ? processInput.value.trim() : '';
    const principalId = principalInput && typeof principalInput.value === 'string' ? principalInput.value.trim() : '';
    const reviewerId = reviewerInput && typeof reviewerInput.value === 'string' ? reviewerInput.value.trim() : '';

    if (!processId) return toast('warning', 'Process ID é obrigatório.');
    if (!principalId) return toast('warning', 'Principal (user_id) é obrigatório.');
    if (!reviewerId) return toast('warning', 'Reviewer (user_id) é obrigatório.');
    if (principalId === reviewerId) return toast('warning', 'Principal e reviewer não podem ser o mesmo usuário.');

    await withButtonLoading(el, async () => {
      try {
        const payload = { process_id: processId, principal_id: principalId, reviewer_id: reviewerId };
        const res = await api.setAssignmentsBulk?.(payload);
        if (resultEl) resultEl.textContent = res ? JSON.stringify(res, null, 2) : '';
        toast('success', 'Atribuições realizadas com sucesso.');
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao atribuir auditores.');
      }
    });
  },

  /**
   * Abre o detalhe de um processo na aba NCS.  Usa o helper do dashboard
   * para carregar as informações e exibir os formulários.  Ao abrir via
   * handler global, mantemos consistência com a navegação da aba.
   */
  'admin-ncs-open-process': async ({ el, event }) => {
    stop(event);
    const pid = el?.dataset?.id ? String(el.dataset.id || '').trim() : '';
    if (!pid) {
      return toast('warning', 'Processo não identificado.');
    }
    try {
      await adminDash.openAdminProcessDetail?.(pid);
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao abrir detalhe do processo.');
    }
  },

  /**
   * Fecha o painel de detalhe (em qualquer aba) e limpa formulários.
   */
  'admin-ncs-close-detail': async ({ el, event }) => {
    stop(event);
    try {
      adminDash.closeAdminProcessDetail?.();
    } catch (err) {
      console.error(err);
    }
  },

  /**
   * Atualiza os dados de triagem do processo.  Lê os campos de status,
   * flags e notas do formulário atual (operação ou NCS) e envia
   * PATCH para o endpoint. Após sucesso, fecha o detalhe e atualiza
   * o dashboard.
   */
  'admin-update-triage': async ({ el, event }) => {
    stop(event);
    const pid = el?.dataset?.id ? String(el.dataset.id || '').trim() : '';
    if (!pid) return toast('warning', 'Processo não identificado.');
    const section = el?.closest('section');
    /** @type {HTMLSelectElement|null} */
    const statusEl = section ? section.querySelector('select[name="status"]') : null;
    /** @type {HTMLInputElement|null} */
    const flagsEl = section ? section.querySelector('input[name="flags"]') : null;
    /** @type {HTMLTextAreaElement|null} */
    const notesEl = section ? section.querySelector('textarea[name="notes"]') : null;
    const status = statusEl && typeof statusEl.value === 'string' ? statusEl.value.trim() : '';
    const flags = flagsEl && typeof flagsEl.value === 'string' ? flagsEl.value.trim() : '';
    const notes = notesEl && typeof notesEl.value === 'string' ? notesEl.value.trim() : '';
    const patch = { status, flags, notes };
    await withButtonLoading(el, async () => {
      try {
        await api.updateProcessTriage?.(pid, patch);
        safeCall(() => audit.addAuditLog?.('admin-update-triage', { processId: pid, patch }));
        toast('success', 'Triagem atualizada com sucesso.');
        adminDash.closeAdminProcessDetail?.();
        await adminDash.refreshAdminDashboard?.();
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao atualizar triagem.');
      }
    });
  },

  /**
   * Registra a decisão final da NCS para o processo.  Lê status, motivo e
   * pontuação do formulário e envia PATCH.  Após sucesso, fecha o
   * detalhe e recarrega as listas.
   */
  'admin-ncs-decide': async ({ el, event }) => {
    stop(event);
    const pid = el?.dataset?.id ? String(el.dataset.id || '').trim() : '';
    if (!pid) return toast('warning', 'Processo não identificado.');
    const section = el?.closest('section');
    /** @type {HTMLSelectElement|null} */
    const statusEl = section ? section.querySelector('select[name="status"]') : null;
    /** @type {HTMLTextAreaElement|null} */
    const reasonEl = section ? section.querySelector('textarea[name="reason"]') : null;
    /** @type {HTMLInputElement|null} */
    const scoreEl = section ? section.querySelector('input[name="score"]') : null;
    const status = statusEl && typeof statusEl.value === 'string' ? statusEl.value.trim() : '';
    const reason = reasonEl && typeof reasonEl.value === 'string' ? reasonEl.value.trim() : '';
    let scoreVal = scoreEl && typeof scoreEl.value === 'string' ? scoreEl.value.trim() : '';
    // Converter pontuação para número quando possível; campo vazio envia null
    let score = null;
    if (scoreVal) {
      const num = Number(scoreVal);
      score = Number.isNaN(num) ? null : num;
    }
    await withButtonLoading(el, async () => {
      try {
        const patch = { status, reason, score };
        await api.updateProcessDecision?.(pid, patch);
        safeCall(() => audit.addAuditLog?.('admin-ncs-decide', { processId: pid, patch }));
        toast('success', 'Decisão registrada com sucesso.');
        adminDash.closeAdminProcessDetail?.();
        await adminDash.refreshAdminDashboard?.();
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao registrar decisão.');
      }
    });
  },

  /**
   * Sinaliza que o processo entrou em etapa de alinhamento interno.  Envia
   * upsertProcessSubmission com action="align" e atualiza as listas.
   */
  'admin-ncs-align': async ({ el, event }) => {
    stop(event);
    const pid = el?.dataset?.id ? String(el.dataset.id || '').trim() : '';
    if (!pid) return toast('warning', 'Processo não identificado.');
    await withButtonLoading(el, async () => {
      try {
        const payload = { process_id: pid, action: 'align' };
        await api.upsertProcessSubmission?.(payload);
        safeCall(() => audit.addAuditLog?.('admin-ncs-align', { processId: pid }));
        toast('success', 'Processo sinalizado para alinhamento.');
        adminDash.closeAdminProcessDetail?.();
        await adminDash.refreshAdminDashboard?.();
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao sinalizar alinhamento.');
      }
    });
  },

  /**
   * Devolve o processo para a Operação, resetando stage para "operation"
   * via resetProcessToOperation.  Após sucesso, fecha o detalhe e
   * recarrega as listas.
   */
  'admin-ncs-return': async ({ el, event }) => {
    stop(event);
    const pid = el?.dataset?.id ? String(el.dataset.id || '').trim() : '';
    if (!pid) return toast('warning', 'Processo não identificado.');
    await withButtonLoading(el, async () => {
      try {
        await api.resetProcessToOperation?.(pid);
        safeCall(() => audit.addAuditLog?.('admin-ncs-return', { processId: pid }));
        toast('success', 'Processo devolvido à Operação.');
        adminDash.closeAdminProcessDetail?.();
        await adminDash.refreshAdminDashboard?.();
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao devolver processo à Operação.');
      }
    });
  },

  // Submissão do cliente
  'client-submit': async ({ el, event }) => {
    stop(event);
    const submitBtn = el;

    try {
      // Verifica se o perfil está completo via clientDash. Se não, bloqueia submissão.
      try {
        const profile = clientDash.getProfileFromProcess?.();
        if (!clientDash.isProfileComplete?.(profile)) {
          const hint = document.getElementById('client-submit-hint');
          if (hint) hint.textContent = 'Complete o Perfil para habilitar a submissão.';
          if (submitBtn) submitBtn.disabled = true;
          toast('warning', 'Complete o Perfil para habilitar a submissão.');
          return;
        }
      } catch {
        // se falhar, segue; submissão será validada no backend
      }

      const requiredIds = [
        'client-declare-minimum',
        'client-declare-truth',
        'client-declare-no-consultancy',
        'client-accept-terms',
        'client-declare-third-party',
      ];
      const checks = requiredIds.map((id) => document.getElementById(id)).filter(Boolean);
      const allChecked = checks.length > 0 && checks.every((cb) => cb.checked);
      const hintEl = document.getElementById('client-submit-hint');
      if (!allChecked) {
        if (submitBtn) submitBtn.disabled = true;
        if (hintEl) hintEl.textContent = 'Para submeter, marque todas as declarações obrigatórias.';
        return;
      }

      // Todas as declarações marcadas.  Agora inicia submissão propriamente dita.
      if (submitBtn) submitBtn.disabled = true;
      if (hintEl) hintEl.textContent = '';

      const processId = state?.session?.currentAuditorProcessId || '';
      if (!processId) {
        toast('warning', 'Processo não selecionado.');
        return;
      }
      await api.submitProcessAction?.({ process_id: processId, action: 'submit' });
      safeCall(() => audit.addAuditLog?.('client-submit', { processId }));
      toast('success', 'Submissão concluída com sucesso. Aguarde a revisão técnica.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao submeter processo.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  'client-submit-hint': async () => {
    // No-op handler: hint é gerenciado dinamicamente.
  },

  'client-declare-minimum': async () => {
    // No-op handler: controle via UI.
  },
  'client-declare-truth': async () => {
    // No-op handler: controle via UI.
  },
  'client-declare-no-consultancy': async () => {
    // No-op handler: controle via UI.
  },
  'client-accept-terms': async () => {
    // No-op handler: controle via UI.
  },
  'client-declare-third-party': async () => {
    // No-op handler: controle via UI.
  },

  'client-profile-save': async ({ el }) => {
    const form = el?.closest('form') || document.getElementById('client-profile-form');
    if (!form) {
      toast('warning', 'Formulário de perfil não encontrado.');
      return;
    }
    await withButtonLoading(el, async () => {
      try {
        const data = new FormData(form);
        const payload = {};
        data.forEach((value, key) => {
          payload[key] = value;
        });
        await api.updateProfile?.(payload);
        safeCall(() => audit.addAuditLog?.('client-profile-save', {}));
        toast('success', 'Perfil atualizado com sucesso.');
      } catch (err) {
        console.error(err);
        toast('error', 'Falha ao atualizar perfil.');
      }
    });
  },

  'client-profile-hint': async () => {
    // No-op handler: mensagem exibida no template.
  },

  'client-public-link': async ({ el, event }) => {
    stop(event);
    const url = el?.dataset?.url || '';
    if (!url) return toast('warning', 'Link público não encontrado.');
    openUrlNewTab(url);
  },

  'client-public-link-short': async ({ el, event }) => {
    stop(event);
    const url = el?.dataset?.url || '';
    if (!url) return toast('warning', 'Link curto não encontrado.');
    openUrlNewTab(url);
  },

  'client-public-link-short-2': async ({ el, event }) => {
    stop(event);
    const url = el?.dataset?.url || '';
    if (!url) return toast('warning', 'Link curto não encontrado.');
    openUrlNewTab(url);
  },

  'client-seal-card': async ({ el }) => {
    const cardId = el?.dataset?.id || '';
    if (!cardId) return toast('warning', 'Cartão de selo inválido.');
    safeCall(() => clientDash.showSealCard?.(cardId));
  },

  'client-download-certificate': async ({ el }) => {
    const certId = el?.dataset?.id || '';
    if (!certId) return toast('warning', 'Certificado inválido.');
    safeCall(() => clientDash.downloadCertificate?.(certId));
  },

  'client-copy-public-link': async ({ el }) => {
    const url = el?.dataset?.url || '';
    if (!url) return toast('warning', 'Link público não encontrado.');
    const ok = await copyToClipboard(url);
    toast(ok ? 'success' : 'error', ok ? 'Link copiado para a área de transferência.' : 'Falha ao copiar link.');
  },

  'client-open-public-page': async ({ el }) => {
    const url = el?.dataset?.url || '';
    if (!url) return toast('warning', 'Página pública não encontrada.');
    openUrlNewTab(url);
  },

  'client-generate-report': async ({ el }) => {
    const type = String(el?.dataset?.type || 'html').toLowerCase();
    await generateReportAndDownload({ role: 'client', type });
  },

  'client-preview-summary': async () => {
    try {
      const html = report.generateExecutiveSummaryHTML?.();
      const cont = document.getElementById('client-deliverables-preview');
      if (cont) cont.innerHTML = html || '';
      toast('success', 'Preview atualizado.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao atualizar preview.');
    }
  },

  'client-deliverables-preview': async () => {
    // No-op: controlado pelo template.
  },

  // Preview sumário para auditor
  'auditor-preview-summary': async () => {
    try {
      const html = report.generateExecutiveSummaryHTML?.();
      const cont = document.getElementById('auditor-deliverables-preview');
      if (cont) cont.innerHTML = html || '';
      toast('success', 'Preview atualizado.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao atualizar preview.');
    }
  },

  // Handlers adicionais restaurados da implementação original. Estes handlers
  // estavam ausentes após a modularização e são necessários para atender ao
  // contrato de ações definido no HTML.

  'client-publish-public': async ({ event }) => {
    stop(event);
    try {
      const publicId = await api.publishPublicPage?.({ kind: 'validation' });
      if (!publicId) return toast('error', 'Falha ao publicar página.');
      const linkText = String(publicId);
      const linkEl = document.getElementById('client-public-link');
      if (linkEl) linkEl.textContent = linkText;
      toast('success', 'Página pública publicada.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao publicar página.');
    }
  },

  // Auditor dashboard actions
  'auditor-home': async ({ el }) => {
    const go = el?.dataset?.go;
    safeCall(() => auditorDash.showAuditorFullDashboard?.(go));
  },

  'auditor-refresh-queue': async () => safeCall(() => auditorDash.renderAuditorQueue?.()),

  'auditor-clear-filters': async ({ event }) => {
    stop(event);
    safeCall(() => {
      const statusSelect = document.getElementById('auditor-filter-status');
      const slaSelect = document.getElementById('auditor-filter-sla');
      const cityInput = document.getElementById('auditor-filter-city');
      const sectorInput = document.getElementById('auditor-filter-sector');
      const searchInput = document.getElementById('auditor-filter-search');
      if (statusSelect) statusSelect.value = '';
      if (slaSelect) slaSelect.value = '';
      if (cityInput) cityInput.value = '';
      if (sectorInput) sectorInput.value = '';
      if (searchInput) searchInput.value = '';
    });
    safeCall(() => auditorDash.renderAuditorQueue?.());
  },

  'auditor-filter': async ({ event }) => {
    stop(event);
    safeCall(() => auditorDash.renderAuditorQueue?.());
  },

  'auditor-triage': async ({ event }) => {
    stop(event);
    safeCall(() => auditorDash.showAuditorFullDashboard?.('queue'));
    safeCall(() => auditorDash.renderAuditorQueue?.());
    toast('info', 'Triagem atualizada.');
  },

  'auditor-assume': async ({ el, event }) => {
    stop(event);
    if (!isAuditor()) return toast('warning', 'Ação disponível apenas para avaliadores.');
    const pid = String(el?.dataset?.id || getCurrentAuditorProcessId() || '').trim();
    if (!pid) return toast('warning', 'Processo inválido.');
    const fn = api.assumeProcess || api.auditorAssume || api.assignSelfAsAuditor;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-assume', { processId: pid, mode: 'stub' }));
      toast('info', 'Assumir responsabilidade pela análise (em desenvolvimento – endpoint pendente).');
      return;
    }
    await withButtonLoading(el, async () => {
      await fn({ processId: pid });
      safeCall(() => audit.addAuditLog?.('auditor-assume', { processId: pid, mode: 'api' }));
    });
    safeCall(() => auditorDash.renderAuditorProcessDetail?.(pid));
    toast('success', 'Processo assumido.');
  },

  'auditor-devolver': async ({ el, event }) => {
    stop(event);
    if (!isAuditor()) return toast('warning', 'Ação disponível apenas para avaliadores.');
    const pid = String(el?.dataset?.id || getCurrentAuditorProcessId() || '').trim();
    if (!pid) return toast('warning', 'Processo inválido.');
    const fn = api.requestChanges || api.devolverProcesso || api.auditorReturn || api.returnProcessToClient;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-devolver', { processId: pid, mode: 'stub' }));
      toast('info', 'Registrar devolutiva (solicitação de esclarecimento/complementação). Esta funcionalidade está em desenvolvimento e segue o regulamento (apenas uma rodada, sem consultoria).');
      return;
    }
    await withButtonLoading(el, async () => {
      await fn({ processId: pid });
      safeCall(() => audit.addAuditLog?.('auditor-devolver', { processId: pid, mode: 'api' }));
    });
    safeCall(() => auditorDash.renderAuditorProcessDetail?.(pid));
    toast('success', 'Devolutiva registrada.');
  },

  'auditor-finalizar': async ({ event }) => {
    stop(event);
    let pid = null;
    try {
      const st = api.getAppState?.();
      pid = st?.currentAuditorProcessId;
    } catch {
      pid = null;
    }
    if (!pid) return toast('warning', 'Nenhum processo selecionado.');
    const fn = api.finalizeProcess || api.auditorFinalize || api.completeProcess;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-finalizar', { processId: pid, mode: 'stub' }));
      toast('info', 'Finalizar processo (em desenvolvimento).');
      return;
    }
    await withButtonLoading(null, async () => {
      await fn({ processId: pid });
      safeCall(() => audit.addAuditLog?.('auditor-finalizar', { processId: pid, mode: 'api' }));
    });
    safeCall(() => auditorDash.renderAuditorProcessDetail?.(pid));
    toast('success', 'Processo finalizado.');
  },

  'auditor-load-by-id': async ({ event }) => {
    stop(event);
    const input = document.getElementById('auditor-process-switcher-id');
    const pid = input ? String(input.value || '').trim() : '';
    if (!pid) return toast('warning', 'Digite um ID de processo.');
    safeCall(() => api.setCurrentAuditorProcess?.(pid));
    safeCall(() => auditorDash.renderAuditorProcessDetail?.(pid));
  },

  'auditor-load-last': async ({ event }) => {
    stop(event);
    let pid = '';
    try {
      const st = api.getAppState?.();
      pid = st?.currentAuditorProcessId;
    } catch {
      pid = '';
    }
    if (!pid) return toast('warning', 'Nenhum processo recente.');
    safeCall(() => auditorDash.renderAuditorProcessDetail?.(pid));
  },

  'auditor-back': async ({ event }) => {
    stop(event);
    try {
      const processesCount = auditorDash.getAuditorProcessesCount?.() ?? 0;
      const queueHidden = document.getElementById('auditor-queue-region')?.hidden;
      if (queueHidden || processesCount === 0) {
        safeCall(() => auditorDash.enterAuditorWorkspace?.());
      } else {
        safeCall(() => auditorDash.enterAuditorQueue?.());
      }
    } catch {
      // noop
    }
  },

  'auditor-switch-detail': async ({ el }) => {
    const target = String(el?.dataset?.section || '').trim();
    if (!target) return;
    safeCall(() => {
      const buttons = document.querySelectorAll('[data-action="auditor-switch-detail"]');
      buttons.forEach((btn) => {
        const active = btn.dataset.section === target;
        if (active) btn.setAttribute('aria-pressed', 'true');
        else btn.removeAttribute('aria-pressed');
      });
      auditorDash.switchAuditorProcessSection?.(target);
    });
  },

  'auditor-save-impartiality': async ({ el, event }) => {
    stop(event);
    if (!isAuditor()) return toast('warning', 'Ação disponível apenas para avaliadores.');
    const currentPid = getCurrentAuditorProcessId();
    if (!currentPid) return toast('warning', 'Selecione um processo antes de salvar.');
    const fn = api.saveImpartiality || api.auditorSaveImpartiality || auditorDash.saveImpartiality;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-save-impartiality', { mode: 'stub' }));
      toast('info', 'Registrar declaração de imparcialidade/impedimento (em desenvolvimento).');
      return;
    }
    await withButtonLoading(el, async () => {
      await fn({ declaredAt: isoNow() });
      safeCall(() => audit.addAuditLog?.('auditor-save-impartiality', { mode: 'api' }));
    });
    toast('success', 'Declaração de imparcialidade salva.');
  },

  'auditor-ai': async ({ event }) => {
    stop(event);
    safeCall(() => chat.openChat?.());
  },

  'auditor-save-feedback': async ({ el, event }) => {
    stop(event);
    if (!isAuditor()) return toast('warning', 'Ação disponível apenas para avaliadores.');
    const pid = String(el?.dataset?.id || getCurrentAuditorProcessId() || '').trim();
    if (!pid) return toast('warning', 'Selecione um processo antes de salvar.');
    const fn = api.saveAuditorFeedback || api.auditorSaveFeedback || auditorDash.saveFeedback;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-save-feedback', { processId: pid || null, mode: 'stub' }));
      toast('info', 'Salvar feedback e recomendações (em desenvolvimento).');
      return;
    }
    await withButtonLoading(el, async () => {
      await fn({ processId: pid || undefined });
      safeCall(() => audit.addAuditLog?.('auditor-save-feedback', { processId: pid || null, mode: 'api' }));
    });
    toast('success', 'Feedback salvo.');
  },

  'auditor-open-report': async ({ el, event }) => {
    stop(event);
    const type = el?.dataset?.type || '';
    if (!type) return;
    safeCall(() => auditorDash.openAuditorReportEditor?.(String(type)));
  },

  'auditor-report-save': async ({ el, event }) => {
    stop(event);
    const type = el?.dataset?.type || '';
    if (!type) return;
    safeCall(() => auditorDash.saveAuditorReportDraft?.(String(type)));
  },

  'auditor-report-ai': async ({ el, event }) => {
    stop(event);
    const type = el?.dataset?.type || '';
    if (!type) return;
    safeCall(() => auditorDash.generateAuditorReportAI?.(String(type)));
  },

  'auditor-report-preview': async ({ el, event }) => {
    stop(event);
    const type = el?.dataset?.type || '';
    if (!type) return;
    safeCall(() => auditorDash.previewAuditorReport?.(String(type)));
  },

  'auditor-change-status': async ({ el, event }) => {
    stop(event);
    if (!isAuditor()) return toast('warning', 'Ação disponível apenas para avaliadores.');
    const pid = String(el?.dataset?.id || getCurrentAuditorProcessId() || '').trim();
    if (!pid) return toast('warning', 'Selecione um processo antes de salvar.');
    const status = String(el?.dataset?.status || '').trim() || String(document.getElementById('auditor-status-select')?.value || '').trim();
    if (!status) return toast('warning', 'Status inválido.');
    const fn = api.changeProcessStatus || api.updateProcessStatus || api.setProcessStatus;
    if (typeof fn !== 'function') {
      safeCall(() => audit.addAuditLog?.('auditor-change-status', { processId: pid, status, mode: 'stub' }));
      toast('info', 'Enviar recomendação de status (decisão final cabe à NCS). Funcionalidade em desenvolvimento.');
      return;
    }
    await withButtonLoading(el, async () => {
      await fn({ processId: pid, status });
      safeCall(() => audit.addAuditLog?.('auditor-change-status', { processId: pid, status, mode: 'api' }));
    });
    toast('success', 'Status atualizado.');
  },

  'auditor-refresh-audit': async ({ el, event }) => {
    stop(event);
    const pid = String(el?.dataset?.id || getCurrentAuditorProcessId() || '').trim();
    if (!pid) {
      toast('warning', 'Nenhum processo selecionado.');
      return;
    }
    try {
      const entries = await api.getAuditLog?.({ processId: pid });
      const containerId = String(el?.dataset?.target || 'auditor-audit-timeline');
      renderAuditTimeline(containerId, Array.isArray(entries) ? entries : []);
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao atualizar linha do tempo.');
    }
  },

  'auditor-export-audit': async ({ el, event }) => {
    stop(event);
    const format = String(el?.dataset?.format || 'json').toLowerCase();
    const data = safeCall(() => audit.exportAuditLog?.(format), '') ?? '';
    const mime = format === 'csv' ? 'text/csv' : format === 'html' ? 'text/html' : 'application/json';
    const filename = format === 'csv' ? 'audit-log.csv' : format === 'html' ? 'audit-log.html' : 'audit-log.json';
    try {
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
      toast('success', 'Exportação concluída.');
    } catch (err) {
      console.error(err);
      toast('error', 'Falha ao exportar log de auditoria.');
    }
  },

  // Admin dashboard actions
  'admin-refresh-dashboard': async ({ event }) => {
    stop(event);
    safeCall(() => adminDash.refreshAdminDashboard?.());
  },

  'admin-switch-tab': async ({ el }) => {
    const target = el?.dataset?.target || 'operacao';
    safeCall(() => adminDash.switchAdminTab?.(target));
  },

  'admin-load-more': async ({ event }) => {
    stop(event);
    safeCall(() => adminDash.loadMoreAdminProcesses?.());
  },

  'admin-filter': async ({ event }) => {
    stop(event);
    safeCall(() => adminDash.renderAdminList?.());
  },

  'admin-clear-filters': async ({ event }) => {
    stop(event);
    safeCall(() => adminDash.clearAdminFilters?.());
  },

  // Chat actions
  'chat-open': async () => safeCall(() => chat.openChat?.()),
  'chat-close': async () => safeCall(() => chat.closeChat?.()),
  'chat-send': async () => safeCall(() => chat.sendChat?.()),
  'chat-faq': async () => safeCall(() => chat.toggleFaq?.()),
};

// (A exportação de `handlers` foi movida para o final deste arquivo junto aos helpers.)

/* ==========================================================================
  Geração de relatórios (mantém comportamento; evidências continuam só view)
============================================================================ */

/**
 * @param {{ role: 'client'|'auditor'|'admin'|string, type: string }} params
 */
async function generateReportAndDownload({ role, type }) {
  const stamp = (isoNow().split('T')[0] || 'relatorio').replace(/[^0-9-]/g, '');
  const t = String(type || '').toLowerCase();

  let html = '';
  let filename = '';

  if (t === 'sumario') {
    try {
      // Carrega o primeiro processo para compor o snapshot.  Usa a API
      // listProcesses() para descobrir o processo ativo e getProcessById()
      // para obter detalhes (incluindo indicadores).  Em seguida busca
      // evidências via listEvidence().  Caso qualquer chamada falhe,
      // fallback para sumário genérico (sem snapshot).
      let proc = null;
      const procs = await api.listProcesses?.({});
      if (Array.isArray(procs)) {
        proc = procs[0] || null;
      } else if (procs && typeof procs === 'object' && Array.isArray(procs.items)) {
        proc = procs.items[0] || null;
      }
      if (proc && proc.id && api.getProcessById) {
        try {
          const detailed = await api.getProcessById(proc.id);
          if (detailed) proc = detailed;
        } catch {}
      }
      const indicators = Array.isArray(proc?.indicators) ? proc.indicators : [];
      let evidences = [];
      if (proc && proc.id && api.listEvidence) {
        try {
          const evList = await api.listEvidence({ processId: String(proc.id) });
          if (Array.isArray(evList)) evidences = evList;
          else if (evList && Array.isArray(evList.items)) evidences = evList.items;
        } catch {}
      }
      const snapshot = { processes: proc ? [proc] : [], indicators, evidences };
      const summaryBlock = report.generateExecutiveSummaryHTML?.(snapshot) || '';
      html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Sumário Executivo</title></head><body>${summaryBlock}</body></html>`;
    } catch (err) {
      console.warn('[actions] sumário com snapshot falhou, usando fallback:', err);
      const summaryBlock = report.generateExecutiveSummaryHTML?.() || '';
      html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Sumário Executivo</title></head><body>${summaryBlock}</body></html>`;
    }
    filename = role === 'auditor' ? `sumario-executivo-auditor-${stamp}.html` : `sumario-executivo-${stamp}.html`;
    safeCall(() => api.recordDeliverable?.('sumario'));
    safeCall(() => report.downloadReportHTML?.(filename, html));
    safeCall(() => audit.addAuditLog?.('generate-report', { role, type: t }));
    updateDeliverablesUI(t);
    return;
  } else if (t === 'parecer') {
    html = deliverables.generateTechnicalOpinionHTML?.() || '';
    filename = role === 'auditor' ? `parecer-tecnico-auditor-${stamp}.html` : `parecer-tecnico-${stamp}.html`;
    safeCall(() => api.recordDeliverable?.('parecer'));
    safeCall(() => report.downloadReportHTML?.(filename, html));
    safeCall(() => audit.addAuditLog?.('generate-report', { role, type: t }));
    updateDeliverablesUI(t);
    return;
  } else if (t === 'plano' || t === 'plan') {
    try {
      // Tenta compor o plano de ação com base no primeiro processo, seus
      // indicadores e evidências.  Quando as chamadas falham, utiliza
      // fallback vazio da função generateActionPlanHTML().
      let proc = null;
      const procs = await api.listProcesses?.({});
      if (Array.isArray(procs)) {
        proc = procs[0] || null;
      } else if (procs && typeof procs === 'object' && Array.isArray(procs.items)) {
        proc = procs.items[0] || null;
      }
      if (proc && proc.id && api.getProcessById) {
        try {
          const detailed = await api.getProcessById(proc.id);
          if (detailed) proc = detailed;
        } catch {}
      }
      const indicators = Array.isArray(proc?.indicators) ? proc.indicators : [];
      let evidences = [];
      if (proc && proc.id && api.listEvidence) {
        try {
          const evList = await api.listEvidence({ processId: String(proc.id) });
          if (Array.isArray(evList)) evidences = evList;
          else if (evList && Array.isArray(evList.items)) evidences = evList.items;
        } catch {}
      }
      const snapshot = { processes: proc ? [proc] : [], indicators, evidences };
      const planBlock = deliverables.generateActionPlanHTML?.({ process: proc, indicators, snapshot }) || '';
      html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Plano de Ação</title></head><body>${planBlock}</body></html>`;
    } catch (err) {
      console.warn('[actions] plano com snapshot falhou, usando fallback:', err);
      const planBlock = deliverables.generateActionPlanHTML?.() || '';
      html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Plano de Ação</title></head><body>${planBlock}</body></html>`;
    }
    filename = role === 'auditor' ? `plano-de-acao-auditor-${stamp}.html` : `plano-de-acao-${stamp}.html`;
    safeCall(() => api.recordDeliverable?.('plano'));
    safeCall(() => report.downloadReportHTML?.(filename, html));
    safeCall(() => audit.addAuditLog?.('generate-report', { role, type: t }));
    updateDeliverablesUI(t);
    return;
  }

  // Fallback: tipo desconhecido
  try {
    // Tenta baixar o relatório de evidências (HTML) via deliverables
    const blob = await deliverables.downloadEvidenceReport?.({ type: t, role });
    if (blob instanceof Blob) {
      const filenameBase = role === 'auditor' ? 'relatorio-evidencias-auditor' : 'relatorio-evidencias';
      const filenameExt = t === 'html' ? '.html' : t === 'pdf' ? '.pdf' : '';
      const filenameFinal = `${filenameBase}-${stamp}${filenameExt}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFinal;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
      safeCall(() => audit.addAuditLog?.('generate-report', { role, type: t }));
      updateDeliverablesUI(t);
      toast('success', 'Relatório baixado.');
      return;
    }
  } catch (err) {
    console.error(err);
    toast('error', 'Falha ao gerar/baixar relatório.');
  }

  toast('warning', 'Tipo de relatório desconhecido ou não suportado.');
}

// Exporte handlers, helpers e utilitários explicitamente para uso em outros módulos.
// O objeto `handlers` contém todas as ações disponíveis.  Ao exportá-lo
// aqui, módulos de escopo (common, client, auditor, admin) podem
// selecionar subconjuntos sem depender da implementação do dispatcher.
export { handlers, safeCall, stop, toast, isoNow, isoPlusDays, renderAuditTimeline, openUrlNewTab, copyToClipboard, withButtonLoading, updateDeliverablesUI, generateReportAndDownload };
