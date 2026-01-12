/**
 * @file src/chat.js
 * @module chat
 * @description Componente de chat (UI) do protótipo NCS. Persistência local desativada; backend-only quando IA habilitada.
 */

/*
 * Chat module (protótipo limpo NCS)
 *
 * Melhorias (sem travar o protótipo):
 * - Anti-duplicação de envio (lock + debounce)
 * - Mensagem "digitando..." (placeholder pendente)
 * - Persistência desativada (backend-only; sem storage local)
 * - Render mais eficiente (DocumentFragment + autoscroll inteligente)
 * - Sanitização e limites (MAX_MESSAGES / MAX_SUGGESTIONS)
 * - Status com aria-live e disable do botão enviar durante envio
 *
 * Observação: cliques (abrir/fechar/enviar/FAQ) continuam delegados via actions.js.
 */

/**
 * @module chat
 */

/* ========================================================================== */
/* Constantes                                                                  */
/* ========================================================================== */

const CHAT_STORAGE_KEY = 'ncs_chat_state_v1';
const MAX_MESSAGES = 80;
const MAX_SUGGESTIONS = 8;
const SEND_DEBOUNCE_MS = 450;

/** Sugestões padrão (fallback). */
const DEFAULT_SUGGESTIONS = [
  'Quais evidências são obrigatórias?',
  'Como melhorar meu status ESG?',
  'Como funciona a autoavaliação?',
  'Quanto tempo demora a verificação?',
  'Quais são os próximos passos?',
];

/**
 * Respostas prontas para cada pergunta frequente.
 * Mensagens curtas para o modo de demonstração quando a IA está desativada.
 *
 * @type {Record<string, string>}
 */
const FAQ_ANSWERS = {
  'Quais evidências são obrigatórias?':
    'As evidências obrigatórias variam conforme o setor e o porte da empresa. Normalmente incluem licença ambiental, relatório de sustentabilidade e código de conduta.',
  'Como melhorar meu status ESG?':
    'Melhore seu status ESG adotando práticas sustentáveis, promovendo ações sociais e fortalecendo a governança com transparência e ética.',
  'Como funciona a autoavaliação?':
    'A autoavaliação orienta a coleta de evidências. Você responde a um questionário sobre práticas ESG e recebe sugestões do que anexar.',
  'Quanto tempo demora a verificação?':
    'O prazo padrão para análise completa é de até 30 dias corridos após a submissão de todas as evidências.',
  'Quais são os próximos passos?':
    'Após enviar suas evidências, um avaliador revisará o material. Você acompanhará o status no painel e poderá receber solicitações de ajustes.',
};

/**
 * Comportamento do protótipo (ajuste fácil).
 *
 * @type {{
 *   autoSendSuggestion: boolean,
 *   autoOpenFaqAfterReply: boolean,
 *   showTypingPlaceholder: boolean,
 *   persist: boolean
 * }}
 */
const CHAT_CONFIG = {
  autoSendSuggestion: true, // sugestão vira mensagem imediata
  autoOpenFaqAfterReply: true, // abre sugestões após resposta do assistente
  showTypingPlaceholder: true, // exibe "Digitando..."
  persist: false, // (por padrão) não salva histórico local
};

/* ========================================================================== */
/* Tipos (JSDoc)                                                               */
/* ========================================================================== */

/**
 * @typedef {'user'|'assistant'} ChatSender
 */

/**
 * @typedef {'input'|'suggestion'} ChatSource
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {ChatSender} sender
 * @property {string} text
 * @property {string} timestamp ISO string
 * @property {boolean} pending
 * @property {ChatSource} [source] Origem (apenas para mensagens do usuário)
 */

/**
 * @typedef {Object} PersistedChatState
 * @property {number} v
 * @property {ChatMessage[]} [messages]
 * @property {string[]} [suggestions]
 * @property {string} [savedAt]
 */

/* ========================================================================== */
/* IA — kill switch                                                            */
/* ========================================================================== */

/**
 * IA deve ser opcional e iniciar desativada.
 *
 * Flags:
 * - Meta: <meta name="ncs-disable-ai" content="1|0">
 * - Global: window.__NCS_DISABLE_AI = true
 * - Padrão: desligada
 *
 * @returns {boolean}
 */
function isAiDisabled() {
  try {
    const meta = document.querySelector('meta[name="ncs-disable-ai"]')?.getAttribute('content');
    const v = String(meta || '').trim().toLowerCase();
    if (v === '1' || v === 'true') return true;
  } catch {}
  try {
    return !!window.__NCS_DISABLE_AI;
  } catch {
    return false;
  }
}

/* ========================================================================== */
/* Estado interno                                                              */
/* ========================================================================== */

/**
 * @type {{
 *   messages: ChatMessage[],
 *   suggestions: string[],
 *   sending: boolean,
 *   faqVisible: boolean,
 *   lastSentAt: number,
 *   _idSeq: number
 * }}
 */
const chatState = {
  messages: [],
  suggestions: [],
  sending: false,
  faqVisible: false,
  lastSentAt: 0,
  _idSeq: 0,
};

/* ========================================================================== */
/* FAQ helpers                                                                 */
/* ========================================================================== */

/**
 * Tenta encontrar uma FAQ relacionada a partir de palavras-chave contidas na pergunta.
 *
 * @param {any} query
 * @returns {string|null} Retorna a pergunta (chave do FAQ_ANSWERS) ou null
 */
function findRelatedFaq(query) {
  const q = String(query || '').toLowerCase();

  // procura por palavra-chave relevante (mínimo 4 letras) em cada pergunta conhecida
  for (const faq of Object.keys(FAQ_ANSWERS)) {
    const words = faq.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length >= 4 && q.includes(w)) return faq;
    }
  }

  return null;
}

/**
 * Mensagem genérica quando não houver FAQ relacionada.
 * @returns {string}
 */
function genericFallback() {
  return 'Sou um assistente de demonstração. Posso ajudar com evidências obrigatórias, autoavaliação e prazos do processo.';
}

/* ========================================================================== */
/* DOM helpers                                                                 */
/* ========================================================================== */

/**
 * @returns {{
 *   panel: HTMLElement|null,
 *   openBtn: HTMLElement|null,
 *   closeBtn: HTMLElement|null,
 *   sendBtn: HTMLButtonElement|null,
 *   input: HTMLInputElement|HTMLTextAreaElement|null,
 *   faqBtn: HTMLElement|null,
 *   faqList: HTMLElement|null,
 *   messages: HTMLElement|null,
 *   status: HTMLElement|null
 * }}
 */
function getEls() {
  return {
    panel: document.getElementById('chat-panel'),
    openBtn: document.getElementById('chat-open-button'),
    closeBtn: document.getElementById('chat-close-button'),
    sendBtn: /** @type {HTMLButtonElement|null} */ (document.getElementById('chat-send-button')),
    input: /** @type {HTMLInputElement|HTMLTextAreaElement|null} */ (document.getElementById('chat-input-field')),
    faqBtn: document.getElementById('chat-faq-button'),
    faqList: document.getElementById('chat-faq-list'),
    messages: document.getElementById('chat-messages'),
    status: document.getElementById('chat-status'),
  };
}

/**
 * Garante atributos de acessibilidade básicos para status e lista de mensagens.
 */
function ensureAriaLive() {
  const { status, messages } = getEls();
  try {
    if (status && !status.getAttribute('aria-live')) {
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('role', 'status');
    }
    // Ajuda SR sem depender do HTML (não quebra se já tiver)
    if (messages && !messages.getAttribute('role')) {
      messages.setAttribute('role', 'log');
      messages.setAttribute('aria-live', 'polite');
    }
  } catch {
    // noop
  }
}

/* ========================================================================== */
/* Persistência leve (opt-in)                                                  */
/* ========================================================================== */

/**
 * @param {string} raw
 * @returns {any|null}
 */
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persiste estado essencial do chat (histórico + sugestões).
 * Observação: por padrão persist=false, então nada é gravado localmente.
 */
function persistState() {
  if (!CHAT_CONFIG.persist) return;

  try {
    /** @type {PersistedChatState} */
    const payload = {
      v: 1,
      messages: chatState.messages.slice(-MAX_MESSAGES),
      suggestions: (Array.isArray(chatState.suggestions) ? chatState.suggestions : []).slice(0, MAX_SUGGESTIONS),
      savedAt: new Date().toISOString(),
    };

    const raw = JSON.stringify(payload);

    try {
      window.localStorage?.setItem?.(CHAT_STORAGE_KEY, raw);
    } catch {
      // noop
    }
  } catch {
    // noop
  }
}

/**
 * Restaura estado persistido do chat (se existir), com saneamento mínimo.
 * Observação: por padrão persist=false, então nada é lido do storage.
 */
function hydrateState() {
  if (!CHAT_CONFIG.persist) return;

  try {
    let raw = '';
    try {
      raw = window.localStorage?.getItem?.(CHAT_STORAGE_KEY) || '';
    } catch {
      raw = '';
    }
    if (!raw) return;

    /** @type {PersistedChatState|null} */
    const data = safeJsonParse(raw);
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.messages)) {
      chatState.messages = data.messages
        .filter((m) => m && typeof m === 'object' && typeof m.text === 'string')
        .slice(-MAX_MESSAGES)
        .map((m) => ({
          id: m.id ?? nextId(),
          sender: m.sender === 'user' ? 'user' : 'assistant',
          text: String(m.text || ''),
          timestamp: m.timestamp || new Date().toISOString(),
          pending: !!m.pending,
          source: m.source === 'suggestion' ? 'suggestion' : m.source === 'input' ? 'input' : undefined,
        }));
    }

    if (Array.isArray(data.suggestions)) {
      chatState.suggestions = sanitizeSuggestions(data.suggestions);
    }
  } catch {
    // noop
  }
}

/* ========================================================================== */
/* Utils                                                                       */
/* ========================================================================== */

/**
 * Gera um id de mensagem.
 * @returns {string}
 */
function nextId() {
  chatState._idSeq += 1;

  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // noop
  }

  return `${Date.now()}-${chatState._idSeq}`;
}

/**
 * Limita tamanho de texto para evitar payload/histórico excessivo.
 * @param {any} s
 * @param {number} [max=2000]
 * @returns {string}
 */
function clampText(s, max = 2000) {
  const t = String(s || '');
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Saneia lista de sugestões: remove vazios, corta comprimento e deduplica.
 * @param {any} list
 * @returns {string[]}
 */
function sanitizeSuggestions(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((q) => {
    const s = String(q || '').trim();
    if (!s) return;
    if (s.length > 140) return;
    if (!out.includes(s)) out.push(s);
  });
  return out.slice(0, MAX_SUGGESTIONS);
}

/** Mantém histórico dentro do limite. */
function trimHistory() {
  if (chatState.messages.length > MAX_MESSAGES) {
    chatState.messages = chatState.messages.slice(-MAX_MESSAGES);
  }
}

/**
 * Decide se deve autoscroll: só força se já estiver perto do fim.
 * @param {HTMLElement} container
 * @returns {boolean}
 */
function shouldAutoScroll(container) {
  const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
  return gap < 80;
}

/**
 * Mostra status temporário (não sobrescreve "Enviando..." quando já setado).
 * @param {string} text
 * @param {number} [ms=1200]
 */
function flashStatus(text, ms = 1200) {
  const { status } = getEls();
  if (!status) return;

  status.textContent = text || '';
  if (!text) return;

  window.setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, ms);
}

/* ========================================================================== */
/* Render                                                                      */
/* ========================================================================== */

function renderMessages() {
  const { messages: container } = getEls();
  if (!container) return;

  const autoScroll = shouldAutoScroll(container);

  container.innerHTML = '';

  const frag = document.createDocumentFragment();

  chatState.messages.forEach((msg) => {
    const div = document.createElement('div');
    const who = msg.sender === 'user' ? 'user' : 'assistant';
    div.className = `chat-message ${who}${msg.pending ? ' pending' : ''}`;
    div.dataset.msgId = String(msg.id || '');
    div.textContent = msg.text;
    frag.appendChild(div);
  });

  container.appendChild(frag);

  if (autoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

function renderSuggestions() {
  const { faqList } = getEls();
  if (!faqList) return;

  faqList.innerHTML = '';

  const list =
    chatState.suggestions && chatState.suggestions.length ? chatState.suggestions : DEFAULT_SUGGESTIONS;

  list.forEach((question) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-faq-item';
    btn.textContent = question;

    btn.addEventListener('click', () => {
      const { input } = getEls();

      // Se estiver enviando, evita duplicação (e não cria fila)
      if (chatState.sending) {
        flashStatus('Aguarde a resposta atual…');
        return;
      }

      if (CHAT_CONFIG.autoSendSuggestion) {
        // Para demo: dispara direto (sem manter texto no input)
        void sendUserMessage(question, { source: 'suggestion' });
      } else {
        if (input) {
          input.value = question;
          input.focus();
        }
      }
    });

    faqList.appendChild(btn);
  });

  if (chatState.faqVisible) faqList.classList.add('show');
  else faqList.classList.remove('show');
}

function renderStatus() {
  const { status, sendBtn } = getEls();
  if (sendBtn) sendBtn.disabled = !!chatState.sending;

  if (!status) return;
  status.textContent = chatState.sending ? 'Enviando…' : '';
}

/* ========================================================================== */
/* UI actions                                                                  */
/* ========================================================================== */

function openChatPanel() {
  const { panel, openBtn, input } = getEls();

  if (panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
  }
  if (openBtn) openBtn.style.display = 'none';

  // foco
  if (input) requestAnimationFrame(() => input.focus());

  // Primeira abertura: injeta saudação apenas se ainda não houver histórico
  if (chatState.messages.length === 0) {
    chatState.messages.push({
      id: nextId(),
      sender: 'assistant',
      text:
        'Olá! Posso ajudar com evidências, indicadores e próximos passos. Você pode perguntar ou usar as sugestões.',
      timestamp: new Date().toISOString(),
      pending: false,
    });

    // sugestões default + abre FAQ
    chatState.suggestions = DEFAULT_SUGGESTIONS.slice(0, MAX_SUGGESTIONS);
    chatState.faqVisible = true;

    trimHistory();
    persistState();
  }

  renderMessages();
  renderSuggestions();
  renderStatus();
}

function closeChatPanel() {
  const { panel, openBtn, faqList } = getEls();

  if (panel) {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  if (openBtn) openBtn.style.display = 'block';

  chatState.faqVisible = false;
  if (faqList) faqList.classList.remove('show');

  persistState();
}

function toggleFaqPanel() {
  chatState.faqVisible = !chatState.faqVisible;
  renderSuggestions();
  persistState();
}

/* ========================================================================== */
/* API call (com snapshot de contexto do dashboard)                            */
/* ========================================================================== */

/**
 * O dashboard expõe window.ncsGetChatContext(). Se não existir, segue sem contexto.
 * @returns {Record<string, any>}
 */
function getChatContextSafe() {
  try {
    if (typeof window !== 'undefined' && typeof window.ncsGetChatContext === 'function') {
      const ctx = window.ncsGetChatContext();
      if (ctx && typeof ctx === 'object') return ctx;
    }
  } catch {
    // noop
  }
  return {};
}

/**
 * @param {any} value
 * @param {number} [max=160]
 * @returns {string}
 */
function cleanStr(value, max = 160) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * @param {any} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

/**
 * Compacta o contexto para evitar payload gordo e garantir compatibilidade com o handler.
 * Mantém só o que o netlify/functions/chat.js já entende (role, empresa, progresso, indicadores, planos).
 *
 * @param {any} ctx
 * @returns {Record<string, any>}
 */
function compactChatContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return {};

  /** @type {Record<string, any>} */
  const out = {
    ctxV: 1,
    userRole: cleanStr(ctx.userRole || ctx.role, 24),
    companyName: cleanStr(ctx.companyName, 120),
    auditStatus: cleanStr(ctx.auditStatus, 60),
    progress: clampNumber(ctx.progress, 0, 100),
  };

  const indicators = Array.isArray(ctx.indicators) ? ctx.indicators : [];
  out.indicators = indicators.slice(0, 24).map((i) => ({
    id: cleanStr(i.id, 40),
    code: cleanStr(i.code || i.id, 40),
    title: cleanStr(i.title || i.name, 140),
    pillar: cleanStr(i.pillar, 8),
    statusFinal: i.statusFinal == null ? null : cleanStr(i.statusFinal, 24),
    statusPrincipal: cleanStr(i.statusPrincipal || 'Pendente', 24),
    statusRevisor: cleanStr(i.statusRevisor || 'Pendente', 24),
    notApplicable: !!(i.notApplicable || i.isNotApplicable),
    isNotApplicable: !!(i.isNotApplicable || i.notApplicable),
  }));

  const plans = Array.isArray(ctx.actionPlans) ? ctx.actionPlans : [];
  out.actionPlans = plans.slice(0, 40).map((p) => ({
    id: cleanStr(p.id, 40),
    title: cleanStr(p.title || p.name, 140),
    status: cleanStr(p.status, 24),
  }));

  if (ctx.processId) out.processId = cleanStr(ctx.processId, 60);

  return out;
}

/**
 * Chama o endpoint do chat.
 * - Tenta /api/chat e depois /.netlify/functions/chat
 * - Trata 429 e offline
 *
 * @param {string} message
 * @returns {Promise<any>}
 */
async function callChatApi(message) {
  const trimmed = String(message || '').trim();

  const payload = {
    message: trimmed,
    context: compactChatContext(getChatContextSafe()),
  };

  if (!navigator.onLine) {
    const err = new Error('Offline');
    // @ts-ignore
    err.code = 'OFFLINE';
    throw err;
  }

  const endpoints = ['/api/chat', '/.netlify/functions/chat'];
  let lastError = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { reply: text || '' };
      }

      if (res.status === 429) {
        const err = new Error((data && data.error) || 'Rate limited');
        // @ts-ignore
        err.code = 429;
        throw err;
      }

      if (res.status === 404 || res.status === 405) {
        lastError = new Error('Endpoint indisponível');
        continue;
      }

      if (!res.ok) {
        const msg = (data && data.error) || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      return data || {};
    } catch (err) {
      lastError = err;
      // @ts-ignore
      if (err && err.code === 429) throw err;
    }
  }

  throw lastError || new Error('Erro desconhecido');
}

/* ========================================================================== */
/* Send flow                                                                   */
/* ========================================================================== */

/**
 * Substitui/atualiza uma mensagem pendente do assistente (placeholder "Digitando…").
 * @param {string} msgId
 * @param {string} nextText
 */
function upsertPendingAssistant(msgId, nextText) {
  const idx = chatState.messages.findIndex((m) => String(m.id) === String(msgId));
  if (idx === -1) return;

  chatState.messages[idx] = {
    ...chatState.messages[idx],
    text: String(nextText || ''),
    pending: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Envia mensagem do usuário, com lock anti-duplicação e placeholder.
 *
 * @param {any} text
 * @param {{source?: ChatSource}} [opts]
 * @returns {Promise<void>}
 */
async function sendUserMessage(text, { source = 'input' } = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;

  // Lock: impede envio concorrente
  if (chatState.sending) {
    flashStatus('Aguarde a resposta atual…');
    return;
  }

  // Debounce: evita Enter duplo / clique rápido
  const now = Date.now();
  if (now - chatState.lastSentAt < SEND_DEBOUNCE_MS) {
    flashStatus('Envio muito rápido — tente novamente.');
    return;
  }
  chatState.lastSentAt = now;

  // registra mensagem do usuário
  chatState.messages.push({
    id: nextId(),
    sender: 'user',
    text: clampText(trimmed),
    timestamp: new Date().toISOString(),
    pending: false,
    source,
  });

  trimHistory();
  renderMessages();

  // limpa input apenas se veio do input
  const { input } = getEls();
  if (input && source === 'input') input.value = '';

  chatState.sending = true;
  renderStatus();

  // placeholder "digitando..."
  let pendingId = null;
  if (CHAT_CONFIG.showTypingPlaceholder) {
    pendingId = nextId();
    chatState.messages.push({
      id: pendingId,
      sender: 'assistant',
      text: 'Digitando…',
      timestamp: new Date().toISOString(),
      pending: true,
    });
    trimHistory();
    renderMessages();
  }

  try {
    // IA desligada: usa respostas locais (FAQ)
    if (isAiDisabled()) {
      let reply;

      if (source === 'suggestion') {
        reply = FAQ_ANSWERS[trimmed] || genericFallback();
      } else {
        const related = findRelatedFaq(trimmed);
        reply = related ? FAQ_ANSWERS[related] : genericFallback();
      }

      if (pendingId) {
        upsertPendingAssistant(pendingId, reply);
      } else {
        chatState.messages.push({
          id: nextId(),
          sender: 'assistant',
          text: reply,
          timestamp: new Date().toISOString(),
          pending: false,
        });
      }

      chatState.suggestions = sanitizeSuggestions(DEFAULT_SUGGESTIONS);
      chatState.faqVisible = true;

      trimHistory();
      persistState();

      renderMessages();
      renderSuggestions();
      return;
    }

    // IA ligada: chama backend
    const data = await callChatApi(trimmed);

    const reply =
      (data && typeof data.reply === 'string' && data.reply.trim()) ||
      'Desculpe, não consegui responder agora. Tente novamente mais tarde.';

    const suggested = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : [];

    if (pendingId) {
      upsertPendingAssistant(pendingId, clampText(reply));
    } else {
      chatState.messages.push({
        id: nextId(),
        sender: 'assistant',
        text: clampText(reply),
        timestamp: new Date().toISOString(),
        pending: false,
      });
    }

    chatState.suggestions = sanitizeSuggestions(suggested);
    chatState.faqVisible = CHAT_CONFIG.autoOpenFaqAfterReply;

    trimHistory();
    persistState();

    renderMessages();
    renderSuggestions();
  } catch (err) {
    console.error('[Chat] API error:', err);

    // @ts-ignore
    const code = err && err.code;

    const msg =
      code === 429
        ? 'Muitas mensagens em pouco tempo. Aguarde um pouco e tente novamente.'
        : code === 'OFFLINE'
          ? 'Você está offline. Conecte-se para usar o chat.'
          : 'Não foi possível obter resposta agora. Tente novamente mais tarde.';

    if (pendingId) {
      upsertPendingAssistant(pendingId, msg);
    } else {
      chatState.messages.push({
        id: nextId(),
        sender: 'assistant',
        text: msg,
        timestamp: new Date().toISOString(),
        pending: false,
      });
    }

    chatState.suggestions = [];
    chatState.faqVisible = false;

    trimHistory();
    persistState();

    renderMessages();
    renderSuggestions();
  } finally {
    chatState.sending = false;
    renderStatus();
  }
}

/** Envia usando o valor atual do input. */
function sendChatFromInput() {
  const { input } = getEls();
  if (!input) return;
  void sendUserMessage(input.value || '', { source: 'input' });
}

/* ========================================================================== */
/* Init + exports (mantém compatibilidade com actions.js)                      */
/* ========================================================================== */

/**
 * Inicializa o chat:
 * - garante aria-live
 * - hidrata estado (se persistência ativa)
 * - render inicial
 * - bind de Enter no input (1x)
 */
export function initializeChat() {
  ensureAriaLive();
  hydrateState();

  // Render inicial (não vincula cliques — actions.js cuida disso)
  renderMessages();
  renderSuggestions();
  renderStatus();

  // Enter para enviar (bind uma vez)
  try {
    const { input } = getEls();
    if (input && !input.__ncsEnterBound) {
      input.__ncsEnterBound = true;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendChatFromInput();
        }
      });
    }
  } catch {
    // noop
  }
}

/** Abre o painel do chat (UI). */
export function openChat() {
  openChatPanel();
}

/** Fecha o painel do chat (UI). */
export function closeChat() {
  closeChatPanel();
}

/** Dispara envio via input atual. */
export function sendChat() {
  sendChatFromInput();
}

/** Alterna visibilidade do FAQ/sugestões. */
export function toggleFaq() {
  toggleFaqPanel();
}
