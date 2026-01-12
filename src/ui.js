import { applyTemplateDeep } from './i18n/index.js';

/**
 * @file src/ui.js
 * @module ui
 * @description Utilitários de UI (modais, abas de auth, toasts, etc.).
 */

/* ui.js
 * Helpers genéricos de UI para o front-end NCS
 *
 * Metas:
 * - Higiene + robustez
 * - Modal acessível (foco, ESC fecha, trap TAB)
 * - Conteúdo do modal rico + links para docs/${slug}.html
 * - Compat: togglePassword(), switchAuthTab(), openModal(), closeModal()
 *
 * Nota de integração:
 * - Se seu front chama openModal() como global, este arquivo expõe window.openModal.
 * - Se seu front usa imports ESM, continue importando { openModal } normalmente.
 */

/**
 * @module ui
 */

/* ==========================================================================
  Helpers básicos (DOM + tipos)
============================================================================ */

/**
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function byId(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

/**
 * @param {any} x
 * @returns {boolean}
 */
function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * @param {any} x
 * @param {string} [fallback='']
 * @returns {string}
 */
function safeStr(x, fallback = '') {
  const s = String(x ?? '').trim();
  return s || fallback;
}

/**
 * @param {any} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (Array.isArray(value)) return value.map((v) => safeStr(v, '')).filter(Boolean);
  const s = safeStr(value, '');
  return s ? [s] : [];
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {any} [text]
 * @returns {HTMLElement}
 */
function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
}

/**
 * Remove conteúdo textual/filhos de um nó (tolerante a null).
 * @param {HTMLElement|null} node
 */
function clearNode(node) {
  if (!node) return;
  node.textContent = '';
}

/**
 * @param {any} value
 * @returns {string}
 */
function cssEscape(value) {
  const str = String(value == null ? '' : value);
  try {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(str);
  } catch {
    // noop
  }
  // Fallback conservador suficiente para nossos ids/atributos
  return str.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/* ==========================================================================
  Toggle de senha
============================================================================ */

/**
 * Alterna a visibilidade de um input de senha.
 *
 * Compat: acionado via data-action="toggle-password" e data-target="<id>".
 *
 * @param {string} targetId id do input password
 */
export function togglePassword(targetId) {
  const input = byId(targetId);
  if (!input) return;

  const type = String(input.getAttribute('type') || '').toLowerCase();
  const next = type === 'password' ? 'text' : 'password';

  try {
    input.setAttribute('type', next);
  } catch {
    // noop
  }

  // A11y opcional: se existir um botão associado por data-target, atualiza aria-pressed
  try {
    const btn = document.querySelector(
      `[data-action="toggle-password"][data-target="${cssEscape(targetId)}"]`
    );
    if (btn) btn.setAttribute('aria-pressed', String(next === 'text'));
  } catch {
    // noop
  }
}

/* ==========================================================================
  Tabs de autenticação
============================================================================ */

/**
 * Alterna entre as abas login/registro na tela de autenticação.
 *
 * @param {'login'|'register'} tab
 */
export function switchAuthTab(tab) {
  const loginTabBtn = byId('tab-login');
  const registerTabBtn = byId('tab-register');
  const loginPanel = byId('login-form-tab');
  const registerPanel = byId('register-form-tab');

  const isLogin = String(tab || 'login') === 'login';

  // Botões/abas
  if (loginTabBtn) {
    loginTabBtn.classList.toggle('active', isLogin);
    loginTabBtn.setAttribute('aria-selected', String(isLogin));
    loginTabBtn.setAttribute('tabindex', isLogin ? '0' : '-1');
  }
  if (registerTabBtn) {
    registerTabBtn.classList.toggle('active', !isLogin);
    registerTabBtn.setAttribute('aria-selected', String(!isLogin));
    registerTabBtn.setAttribute('tabindex', !isLogin ? '0' : '-1');
  }

  // Painéis
  if (loginPanel) {
    loginPanel.classList.toggle('active', isLogin);
    loginPanel.hidden = !isLogin;
    loginPanel.setAttribute('aria-hidden', String(!isLogin));
  }
  if (registerPanel) {
    registerPanel.classList.toggle('active', !isLogin);
    registerPanel.hidden = isLogin;
    registerPanel.setAttribute('aria-hidden', String(isLogin));
  }
}

/* ========================================================================
  Toast helper
========================================================================= */

/**
 * Exibe uma mensagem do tipo toast.  Delegará para uma implementação
 * global (window.toast) quando disponível; caso contrário, emitirá
 * mensagens no console.  Este helper é exportado explicitamente para
 * satisfazer importações em src/actions/handlers.js e evitar erros de
 * propriedade inexistente.
 *
 * @param {'success'|'info'|'warning'|'error'|string} type
 * @param {string} message
 */
export function toast(type, message) {
  const t = String(type || 'info');
  const msg = String(message || '');
  const fn = (globalThis && /** @type {any} */ (globalThis).toast) || null;
  if (typeof fn === 'function') {
    // Invoke the global toast handler with (type, message)
    return fn(t, msg);
  }
  const tag = t.toUpperCase();
  // Fallback to console when no toast implementation is present
  console.log(`[${tag}] ${msg}`);
}

/* ==========================================================================
  Modal informativo (acessível + conteúdo rico)
============================================================================ */

/**
 * @typedef {Object} ModalContent
 * @property {string} title
 * @property {string} [meta]
 * @property {string} [definition]
 * @property {string|string[]} [body]
 * @property {string[]} [highlights]
 * @property {string} [slug]
 */

const MODAL_IDS = Object.freeze({
  root: 'info-modal',
  title: 'modal-title',
  body: 'modal-body',
});

let _lastFocusedEl = null;
let _modalKeydownBound = false;

/**
 * @returns {{ modal: HTMLElement|null, titleEl: HTMLElement|null, bodyEl: HTMLElement|null }}
 */
function getModalEls() {
  return {
    modal: byId(MODAL_IDS.root),
    titleEl: byId(MODAL_IDS.title),
    bodyEl: byId(MODAL_IDS.body),
  };
}

/**
 * Normaliza e valida conteúdo do modal, com fallback defensivo.
 *
 * @param {any} key
 * @returns {{ title: string, meta: string, definition: string, body: string|string[], highlights: string[], slug: string }}
 */
function normalizeModalContent(key) {
  const k = safeStr(key, '');
  const fallback = { title: 'Informação', body: 'Conteúdo indisponível.' };

  /** @type {any} */
  const raw = modalContent[k];
  // Fallback básico se a chave for inválida ou se o conteúdo não for um
  // objeto plano.  Retorna o fallback com tokens traduzidos.
  if (!raw || !isPlainObject(raw)) {
    const result = {
      title: fallback.title,
      meta: '',
      definition: '',
      body: fallback.body,
      highlights: [],
      slug: '',
    };
    return applyTemplateDeep(result);
  }
  // Normaliza campos presentes no conteúdo cru.  Arrays são mantidos; outros
  // tipos são convertidos para strings.  Em seguida aplica a
  // substituição de tokens via applyTemplateDeep para interpolar
  // {program.name_full}, {program.seal_name} etc.
  const result = {
    title: safeStr(raw.title, fallback.title),
    meta: safeStr(raw.meta, ''),
    definition: safeStr(raw.definition, ''),
    body: Array.isArray(raw.body) ? raw.body : safeStr(raw.body, ''),
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    slug: safeStr(raw.slug, ''),
  };
  return applyTemplateDeep(result);
}

/**
 * Alterna uma classe no body para permitir travar scroll via CSS.
 * @param {boolean} locked
 */
function lockPageScroll(locked) {
  try {
    document.body.classList.toggle('is-modal-open', !!locked);
  } catch {
    // noop
  }
}

/**
 * @param {Element|null} el
 * @returns {boolean}
 */
function isVisible(el) {
  if (!el) return false;

  // offsetParent pode ser null em position:fixed; então usamos retângulos como fallback
  try {
    if (/** @type {any} */ (el).offsetParent !== null) return true;
    return !!(el.getClientRects && el.getClientRects().length);
  } catch {
    return false;
  }
}

/**
 * Encontra elementos focáveis dentro do container (somente visíveis).
 * @param {HTMLElement|null} container
 * @returns {HTMLElement[]}
 */
function findFocusable(container) {
  if (!container) return [];

  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll(selectors)).filter((el) => isVisible(el));
}

/**
 * Trap de foco e ESC para fechar, enquanto modal estiver aberto.
 * @param {KeyboardEvent} e
 * @param {HTMLElement|null} modal
 */
function trapFocusKeydown(e, modal) {
  if (!modal || !modal.classList.contains('open')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
    return;
  }

  if (e.key !== 'Tab') return;

  const focusables = findFocusable(modal);
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (e.shiftKey) {
    if (active === first || active === modal) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/**
 * Garante atributos e bindings de acessibilidade do modal.
 * - role/aria-modal/aria-labelledby/tabindex
 * - click no backdrop fecha
 * - listener global de keydown (1x) para ESC + trap de TAB
 *
 * @param {HTMLElement|null} modal
 * @param {HTMLElement|null} titleEl
 */
function ensureModalA11y(modal, titleEl) {
  if (!modal) return;

  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (titleEl?.id) modal.setAttribute('aria-labelledby', titleEl.id);

  if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');

  // backdrop click
  if (!modal.__ncsBackdropBound) {
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) closeModal();
    });
    modal.__ncsBackdropBound = true;
  }

  // keydown global (1x)
  if (!_modalKeydownBound) {
    _modalKeydownBound = true;
    window.addEventListener('keydown', (e) => {
      const { modal: m } = getModalEls();
      trapFocusKeydown(e, m);
    });
  }
}

/**
 * Monta corpo do modal com conteúdo rico (parágrafos, highlights e links).
 * @param {{ meta: string, definition: string, body: string|string[], highlights: string[], slug: string }} content
 * @returns {DocumentFragment}
 */
function buildModalBody(content) {
  const frag = document.createDocumentFragment();

  if (content.meta) frag.appendChild(createEl('p', 'modal-meta', content.meta));

  if (content.definition) {
    const def = createEl('div', 'modal-definition');
    const strong = document.createElement('strong');
    strong.textContent = 'Definição: ';
    const span = document.createElement('span');
    span.textContent = content.definition;
    def.appendChild(strong);
    def.appendChild(span);
    frag.appendChild(def);
  }

  if (Array.isArray(content.body)) {
    const paragraphs = asStringArray(content.body);
    paragraphs.forEach((txt) => frag.appendChild(createEl('p', '', txt)));
  } else {
    frag.appendChild(createEl('p', '', safeStr(content.body, '')));
  }

  const highlights = asStringArray(content.highlights);
  if (highlights.length) {
    const ul = createEl('ul', 'modal-highlights');
    highlights.forEach((item) => ul.appendChild(createEl('li', '', item)));
    frag.appendChild(ul);
  }

  if (content.slug) {
    const actions = createEl('div', 'modal-actions');
    const docUrl = `docs/${content.slug}.html`;

    const fullLink = document.createElement('a');
    fullLink.href = docUrl;
    fullLink.target = '_blank';
    fullLink.rel = 'noopener noreferrer';
    fullLink.className = 'btn btn-secondary';
    fullLink.textContent = 'Ver versão completa';
    actions.appendChild(fullLink);

    const pdfLink = document.createElement('a');
    pdfLink.href = docUrl;
    pdfLink.target = '_blank';
    pdfLink.rel = 'noopener noreferrer';
    pdfLink.className = 'btn btn-secondary';
    pdfLink.textContent = 'Imprimir / Salvar em PDF';

    pdfLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      try {
        const w = window.open(docUrl, '_blank', 'noopener,noreferrer');
        if (!w) {
          window.open(docUrl, '_blank');
          return;
        }

        const doPrint = () => {
          try {
            w.focus();
            w.print();
          } catch {
            // noop
          }
        };

        try {
          if (w.document && w.document.readyState === 'complete') {
            setTimeout(doPrint, 50);
          } else {
            w.addEventListener('load', () => setTimeout(doPrint, 50), { once: true });
          }
        } catch {
          setTimeout(doPrint, 250);
        }
      } catch {
        try {
          window.location.href = docUrl;
        } catch {
          // noop
        }
      }
    });

    actions.appendChild(pdfLink);
    frag.appendChild(actions);
  }

  return frag;
}

/**
 * Abre o modal identificado pela chave lógica (data-modal).
 * @param {string} key
 */
export function openModal(key) {
  const { modal, titleEl, bodyEl } = getModalEls();

  // Se isso falha, parece “ui.js não puxou”, mas na real é ID/HTML não batendo.
  if (!modal || !titleEl || !bodyEl) return;

  const content = normalizeModalContent(key);

  _lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  titleEl.textContent = content.title;

  clearNode(bodyEl);
  bodyEl.appendChild(buildModalBody(content));

  ensureModalA11y(modal, titleEl);
  modal.classList.add('open');
  lockPageScroll(true);

  requestAnimationFrame(() => {
    const focusables = findFocusable(modal);
    (focusables[0] || modal).focus?.();
  });
}

/**
 * Fecha qualquer modal aberto.
 */
export function closeModal() {
  const openModals = document.querySelectorAll('.modal.open');
  openModals.forEach((m) => m.classList.remove('open'));

  lockPageScroll(false);

  try {
    if (_lastFocusedEl && document.contains(_lastFocusedEl)) _lastFocusedEl.focus();
  } catch {
    // noop
  } finally {
    _lastFocusedEl = null;
  }
}

/* ==========================================================================
  Conteúdos do modal (chave -> conteúdo)
  As chaves devem bater com data-modal no HTML
============================================================================ */

/** @type {Record<string, ModalContent>} */
const modalContent = {
  criteria: {
    title: 'Critérios e Metodologia',
    body:
      'Esta seção resume como funciona o Programa de Verificação Independente — {program.name_full} (E/S/G), incluindo a lógica de evidências, rastreabilidade e dupla checagem.',
  },

  // =========================
  // BASE NORMATIVA (9 docs)
  // =========================

  'regulation-program': {
    title: 'Regulamento do Programa (critérios, metodologia e evidências)',
    meta: 'Versão 1.0 — 23/12/2025',
    definition:
      'Documento-mestre do Programa: define objetivos/escopo, regras do ciclo, critérios e método de avaliação, além da política de evidências e rastreabilidade.',
    body: [
      'Consolida quem pode participar, como o ciclo funciona, papéis/responsabilidades e efeitos do resultado (status, manutenção e limites).',
      'Descreve a verificação (dupla avaliação e gestão de divergências) e como o dossiê de evidências sustenta a decisão.',
    ],
    highlights: [
      'Elegibilidade, escopo e ciclo.',
      'Dupla avaliação e divergências.',
      'Pontuação/materialidade e status.',
      'Evidências e trilha do caso.',
    ],
    slug: 'regulation-program',
  },

  'regulation-seal-use': {
    title: 'Regulamento de Uso e Divulgação do Selo',
    meta: 'Versão 1.0 — 23/12/2025',
    definition:
      'Regras públicas para comunicar o status do {program.seal_name}: onde aplicar, como usar a marca e quais alegações são proibidas.',
    body: [
      'Padroniza o uso do selo em canais e materiais e impõe limites de linguagem para evitar comunicação enganosa.',
      'Define condições de suspensão/retirada do direito de uso em caso de perda de status, término de ciclo ou uso indevido.',
    ],
    highlights: [
      'Linguagem permitida e canais.',
      'Proibições (certificação/acreditação/ISO/auditoria regulatória).',
      'Retirada do direito de uso por infração.',
    ],
    slug: 'regulation-seal-use',
  },

  'terms-process': {
    title: 'Termos do Processo de Verificação',
    meta: 'Versão 1.0 — 22/12/2025',
    definition:
      'Condições de participação no Programa: deveres do participante, etapas do processo, regras do resultado do ciclo e hipóteses de suspensão/encerramento.',
    body: [
      'Estabelece dever de veracidade, envio de evidências, prazos e limites de escopo.',
      'Descreve como funciona a verificação e as consequências técnicas de ausência de evidências/descumprimentos.',
    ],
    highlights: ['Deveres e prazos.', 'Regras do processo e do status.', 'Hipóteses de suspensão/encerramento.'],
    slug: 'terms-process',
  },

  'privacy-process': {
    title: 'Aviso de Privacidade do Processo',
    meta: 'Versão 1.0 — 22/12/2025',
    definition:
      'Tratamento de dados pessoais no dossiê do ciclo (evidências/relatórios): responsabilidades, retenção, segurança e acesso restrito.',
    body: [
      'Foca no que é submetido para verificação (evidências e relatórios), com regras de retenção e acesso restrito ao caso.',
      'Orienta o exercício de direitos quando houver dados pessoais em evidências do processo.',
    ],
    highlights: [
      'Escopo: evidências e relatórios.',
      'Retenção, segurança e acesso restrito.',
      'Direitos do titular no contexto do processo.',
    ],
    slug: 'privacy-process',
  },

  'terms-platform': {
    title: 'Termos de Uso da Plataforma',
    meta: 'Versão 1.0 — 22/12/2025',
    definition:
      'Regras de acesso e uso do portal: conta, segurança, responsabilidades por conteúdo enviado e limites operacionais.',
    body: [
      'Define condições de uso da plataforma (cadastro, autenticação, boas práticas) e responsabilidades do usuário.',
      'Delimita limitações técnicas e condutas proibidas.',
    ],
    highlights: ['Conta e segurança.', 'Responsabilidade por conteúdo.', 'Condutas proibidas e limitações.'],
    slug: 'terms-platform',
  },

  'privacy-platform': {
    title: 'Política de Privacidade do Portal',
    meta: 'Versão 1.0 — 22/12/2025',
    definition:
      'Tratamento de dados no portal (cadastro, navegação e logs): finalidades, segurança e direitos do titular.',
    body: [
      'Explica dados coletados no portal (ex.: cadastro/login/logs), finalidades e medidas de segurança.',
      'Indica direitos do titular e canal de contato.',
    ],
    highlights: ['Dados e finalidades no portal.', 'Cookies/logs e segurança.', 'Direitos do titular e contato.'],
    slug: 'privacy-platform',
  },

  'policy-impartiality-coi': {
    title: 'Política de Imparcialidade e Conflito de Interesses (COI)',
    meta: 'Versão 1.0 — 28/12/2025',
    definition:
      'Regras de integridade: prevenção/gestão de COI, impedimentos, declaração de vínculos e firewall {program.name_short} ↔ Operação ↔ Avaliadores.',
    body: [
      'Define como identificar e tratar situações que possam comprometer (ou parecer comprometer) a imparcialidade do Programa.',
      'Prevê medidas de mitigação e registro rastreável.',
    ],
    highlights: ['Declaração de COI e transparência.', 'Impedimentos/recusas.', 'Mitigações e registro.', 'Firewall de funções.'],
    slug: 'policy-impartiality-coi',
  },

  'procedure-appeals-complaints-denunciations': {
    title: 'Procedimento de Apelações, Reclamações e Denúncias',
    meta: 'Versão 1.0 — 28/12/2025',
    definition:
      'Devido processo para recursos, reclamações e denúncias: triagem, prazos, contraditório, decisão e comunicação com registro por protocolo.',
    body: [
      'Organiza admissibilidade, instrução e decisão, com confidencialidade proporcional ao caso.',
      'Prevê medidas corretivas/sancionatórias e melhoria contínua.',
    ],
    highlights: ['Canais e protocolo.', 'Prazos e etapas.', 'Contraditório e registro.', 'Medidas e proteção contra retaliação.'],
    slug: 'procedure-appeals-complaints-denunciations',
  },

  'code-auditor-conduct': {
    title: 'Código de Conduta e Independência do Avaliador',
    meta: 'Versão 1.0 — 28/12/2025',
    definition:
      'Deveres e vedações do Avaliador: rigor técnico, sigilo, comunicação profissional e proibição de consultoria disfarçada/promessa de resultado.',
    body: [
      'Define padrões do parecer técnico e limites de interação com participantes.',
      'Inclui condutas vedadas e consequências disciplinares.',
    ],
    highlights: [
      'Rigor/objetividade/consistência.',
      'Sigilo e minimização de dados pessoais.',
      'Sem promessa de resultado / sem consultoria disfarçada.',
      'Sanções: advertência, suspensão, descredenciamento.',
    ],
    slug: 'code-auditor-conduct',
  },

  /*
   * Aliases para facilitar navegação: alguns componentes utilizam chaves
   * simplificadas (ex.: "seal-use") que apontam para documentos
   * normativos já definidos.  Estas entradas são cópias (spread) do
   * conteúdo original para garantir que o contrato front-end as reconheça.
   */
  'seal-use': {
    title: 'Regulamento de Uso e Divulgação do Selo',
    meta: 'Versão 1.0 — 23/12/2025',
    definition:
      'Regras públicas para comunicar o status do {program.seal_name}: onde aplicar, como usar a marca e quais alegações são proibidas.',
    body: [
      'Padroniza o uso do selo em canais e materiais e impõe limites de linguagem para evitar comunicação enganosa.',
      'Define condições de suspensão/retirada do direito de uso em caso de perda de status, término de ciclo ou uso indevido.',
    ],
    highlights: [
      'Linguagem permitida e canais.',
      'Proibições (certificação/acreditação/ISO/auditoria regulatória).',
      'Retirada do direito de uso por infração.',
    ],
    slug: 'regulation-seal-use',
  },

  'impartiality-policy': {
    title: 'Política de Imparcialidade e Conflito de Interesses (COI)',
    meta: 'Versão 1.0 — 28/12/2025',
    definition:
      'Regras de integridade: prevenção/gestão de COI, impedimentos, declaração de vínculos e firewall {program.name_short} ↔ Operação ↔ Avaliadores.',
    body: [
      'Define como identificar e tratar situações que possam comprometer (ou parecer comprometer) a imparcialidade do Programa.',
      'Prevê medidas de mitigação e registro rastreável.',
    ],
    highlights: ['Declaração de COI e transparência.', 'Impedimentos/recusas.', 'Mitigações e registro.', 'Firewall de funções.'],
    slug: 'policy-impartiality-coi',
  },

  'appeals': {
    title: 'Procedimento de Apelações, Reclamações e Denúncias',
    meta: 'Versão 1.0 — 28/12/2025',
    definition:
      'Devido processo para recursos, reclamações e denúncias: triagem, prazos, contraditório, decisão e comunicação com registro por protocolo.',
    body: [
      'Organiza admissibilidade, instrução e decisão, com confidencialidade proporcional ao caso.',
      'Prevê medidas corretivas/sancionatórias e melhoria contínua.',
    ],
    highlights: ['Canais e protocolo.', 'Prazos e etapas.', 'Contraditório e registro.', 'Medidas e proteção contra retaliação.'],
    slug: 'procedure-appeals-complaints-denunciations',
  },

  'client-guide': {
    title: 'Guia do Processo',
    meta: '',
    definition: '',
    body: [
      'Resumo das regras, metodologia e do porquê o selo possui credibilidade pública.',
      'Descreve as etapas do ciclo, responsabilidades dos participantes e destaca documentos de referência úteis.',
    ],
    highlights: [],
    slug: 'client-guide',
  },
};


/* ==========================================================================
  Ponte de compatibilidade (legado): expõe API em window
  - resolve casos em que o HTML/JS chama openModal() diretamente
============================================================================ */

/**
 * Expõe helpers no escopo global, sem sobrescrever caso já exista.
 * Útil para páginas/HTML legado que chamam funções diretamente.
 */
function exposeGlobals() {
  try {
    if (typeof window === 'undefined') return;

    // Evita sobrescrever se outro módulo já definiu (ou se você quer manter wrappers)
    if (!window.openModal) window.openModal = openModal;
    if (!window.closeModal) window.closeModal = closeModal;
    if (!window.togglePassword) window.togglePassword = togglePassword;
    if (!window.switchAuthTab) window.switchAuthTab = switchAuthTab;

    // Namespace opcional para debug
    if (!window.NCSUI) {
      window.NCSUI = Object.freeze({
        openModal,
        closeModal,
        togglePassword,
        switchAuthTab,
      });
    }
  } catch {
    // noop
  }
}

// A compatibilidade legada via window.* foi removida.  Mantenha a
// função definida para eventuais referências internas, mas não a
// invocamos automaticamente.  Código externo deve importar
// explicitamente os helpers de ui.js ao invés de depender de
// propriedades globais no objeto window.
