/**
 * @file src/auth.js
 * @module auth
 * @description Fluxos de autenticação do front (login único + redirecionamento por role) e wiring de UI (sem storage local).
 */

/*
 * auth.js — Autenticação (backend-only)
 *
 * HARD CUT:
 * - Sem credenciais demo.
 * - Sem registro client-side (por enquanto).
 * - Sem local storage.
 *
 * Fonte de verdade: backend (/api/auth/login) via services/api.js.
 */

import { saveSession, authenticateUser, fetchMe, registerUser } from './services/api.js';
import { navigateTo } from './router.js';
import { deriveUserIdFromEmail } from './state.js';
import { updateNavbar } from './navbar.js';

/* ==========================================================================
  Helpers de UI e normalização
============================================================================ */

function $id(id) {
  return document.getElementById(id);
}

function safeStr(x, fallback = '') {
  const s = String(x ?? '').trim();
  return s || fallback;
}

function normalizeRole(value) {
  const v = safeStr(value, '').toLowerCase();
  if (v === 'admin' || v === 'auditor' || v === 'client') return v;
  return '';
}

/**
 * Remove prefixos técnicos do tipo "AUTH_BACKEND_ERROR: ..." antes de exibir na UI.
 * Também aceita padrões com hífen e espaços, e remove o "Falha no login:" duplicado.
 */
function cleanUiMessage(input, fallback = 'Ocorreu um erro.') {
  let s = safeStr(input, '');
  if (!s) return fallback;

  // se veio "Falha no login: AUTH_BACKEND_ERROR: ..." mantém só a parte útil
  s = s.replace(/^Falha no (login|cadastro)\s*:\s*/i, '');

  // remove prefixos "CODE:" em CAIXA ALTA (com underscore/dígitos)
  s = s.replace(/^[A-Z0-9_]{3,}:\s*/g, '');

  // remove "Error:" do JS
  s = s.replace(/^Error:\s*/i, '');

  s = s.trim();
  return s || fallback;
}

function looksLikeEmailNotConfirmed(msg) {
  const m = safeStr(msg, '').toLowerCase();
  return (
    m.includes('not confirmed') ||
    m.includes('email not confirmed') ||
    m.includes('confirm') && m.includes('email') ||
    m.includes('não foi confirmado') ||
    m.includes('nao foi confirmado')
  );
}

/**
 * Resolve a role efetiva para o front.
 *
 * Fonte preferencial: `meOut.role`.
 * Fallback: lista `meOut.roles` (quando o backend expõe memberships/roles).
 *
 * Segurança: isso NÃO concede privilégios no backend. Rotas sensíveis continuam
 * protegidas por cookie/JWT e checagens server-side.
 *
 * @param {any} meOut Resposta de /api/auth/me
 * @returns {'client'|'auditor'|'admin'}
 */
function resolveEffectiveRole(meOut) {
  const backendRole = normalizeRole(meOut?.role);
  if (backendRole) return backendRole;

  const roles = Array.isArray(meOut?.roles)
    ? meOut.roles.map((r) => normalizeRole(r)).filter(Boolean)
    : [];

  if (roles.includes('admin')) return 'admin';
  if (roles.includes('auditor')) return 'auditor';
  return 'client';
}

function normalizeEmail(value) {
  return safeStr(value, '').toLowerCase();
}

function readInput(form, selector) {
  try {
    return form?.querySelector(selector)?.value ?? '';
  } catch {
    return '';
  }
}

function setError(targetId, message) {
  const el = $id(targetId);
  if (!el) return;
  const msg = safeStr(message, '');
  el.textContent = msg;
  // Ajuda UX: some quando vazio
  el.style.display = msg ? 'block' : 'none';
}

function clearError(targetId) {
  setError(targetId, '');
}

/**
 * Aplica a sessão no state a partir do payload de /api/auth/me.
 * @param {any} meOut
 * @param {{ emailHint?: string, company?: string }} [hints]
 */
function applySessionFromMe(meOut, hints = {}) {
  const role = resolveEffectiveRole(meOut);
  const email = safeStr(meOut?.user?.email, hints.emailHint || '');
  const userId = safeStr(meOut?.user?.id, '') || deriveUserIdFromEmail(email);

  saveSession({
    isLoggedIn: true,
    role,
    email,
    userId,
    roles: Array.isArray(meOut?.roles)
      ? meOut.roles.map((r) => normalizeRole(r)).filter(Boolean)
      : [],
    company: role === 'client' ? safeStr(hints.company, '') : '',
    // cookie-first: NÃO manter tokens no browser.
    accessToken: '',
    tokenType: '',
    expiresAt: null,
  });
}

/**
 * Hidrata a sessão via cookie HttpOnly.
 * Deve ser chamado no boot (main.js) e após login bem-sucedido.
 *
 * @returns {Promise<any|null>}
 */
export async function hydrateSession() {
  try {
    const meOut = await fetchMe();
    if (meOut && meOut.ok && meOut.user) {
      applySessionFromMe(meOut, { emailHint: safeStr(meOut?.user?.email, '') });
      updateNavbar();
      return meOut;
    }
  } catch {
    // 401 é esperado quando não há sessão; não deve quebrar o boot.
  }
  return null;
}

/**
 * Fluxo padrão após login (cookie-first):
 * - chama /api/auth/login (set-cookie)
 * - confirma sessão em /api/auth/me
 * - salva sessão em memória
 * - atualiza navbar
 * - navega para o dashboard conforme role retornado
 *
 * @param {{ email: string, company: string }} params
 */
async function completeAuth({ email, company }) {
  const meOut = await fetchMe();

  if (!meOut || !meOut.ok || !meOut.user) {
    throw new Error('Sessão não confirmada. Verifique cookies (HttpOnly) e /api/auth/me.');
  }

  applySessionFromMe(meOut, { emailHint: email, company });
  updateNavbar();

  const role = resolveEffectiveRole(meOut);
  if (role === 'admin') navigateTo('admin-dashboard');
  else if (role === 'auditor') navigateTo('auditor-dashboard');
  else navigateTo('client-dashboard');
}

/* ==========================================================================
  Handlers públicos
============================================================================ */

/**
 * Login Participante (client)
 * IDs atuais no HTML:
 * - form: #login-form
 * - inputs: #login-email, #login-password
 * - erro: #login-error
 */
export async function handleLogin(event) {
  event?.preventDefault?.();
  clearError('login-error');

  const form = event?.target || $id('login-form') || $id('loginForm');
  const email = normalizeEmail(readInput(form, '#login-email') || readInput(form, '#loginEmail'));
  const password = safeStr(readInput(form, '#login-password') || readInput(form, '#loginPassword'));

  if (!email || !password) {
    setError('login-error', 'Preencha email e senha.');
    return;
  }

  try {
    await authenticateUser({ email, password });
    await completeAuth({ email, company: '' });
  } catch (err) {
    const raw = safeStr(err?.message, 'erro desconhecido');
    const msg = cleanUiMessage(raw, 'Falha ao autenticar.');
    if (looksLikeEmailNotConfirmed(raw)) {
      setError('login-error', 'Seu email ainda não foi confirmado. Verifique sua caixa de entrada e confirme o cadastro antes de entrar.');
      return;
    }
    setError('login-error', `Falha no login: ${msg}`);
  }
}

/**
 * Registro
 * IDs atuais no HTML: #register-form / erro: #register-error
 */
export async function handleRegister(event) {
  event?.preventDefault?.();
  clearError('register-error');

  const form = event?.target || $id('register-form') || $id('registerForm');
  const company = safeStr(readInput(form, '#register-company') || readInput(form, '#registerCompany'));
  const email = normalizeEmail(readInput(form, '#register-email') || readInput(form, '#registerEmail'));
  const password = safeStr(readInput(form, '#register-password') || readInput(form, '#registerPassword'));
  const confirm = safeStr(readInput(form, '#register-password-confirm') || readInput(form, '#registerPasswordConfirm'));

  // Checkboxes for terms
  let acceptPlatform = false;
  let acceptProcess = false;
  try {
    const checkboxPlatform = form?.querySelector('input[name="accept_terms_platform"]');
    const checkboxProcess = form?.querySelector('input[name="accept_terms_process"]');
    acceptPlatform = !!checkboxPlatform?.checked;
    acceptProcess = !!checkboxProcess?.checked;
  } catch {
    /* ignore */
  }

  if (!company || !email || !password || !confirm) {
    setError('register-error', 'Preencha todos os campos obrigatórios.');
    return;
  }
  if (password !== confirm) {
    setError('register-error', 'As senhas não conferem.');
    return;
  }
  if (!acceptPlatform || !acceptProcess) {
    setError('register-error', 'Você deve aceitar os termos para prosseguir.');
    return;
  }

  try {
    const out = await registerUser({
      company_name: company,
      email,
      password,
      accept_terms_platform: acceptPlatform,
      accept_terms_process: acceptProcess,
    });

    // Se o backend retornou session:'pending', significa que é necessário confirmar o email e nenhum cookie foi emitido.
    if (out && out.session === 'pending') {
      // Mensagem amigável para informar o usuário a checar o e-mail
      setError(
        'register-error',
        `Conta criada! Verifique seu e-mail para concluir o cadastro e depois faça login.`
      );
      return;
    }

    // Quando há cookies/sessão, segue fluxo normal de autenticação.
    const companyHint = out && out.company && typeof out.company.slug === 'string' ? out.company.slug : '';
    await completeAuth({ email, company: companyHint });
  } catch (err) {
    const raw = safeStr(err?.message, 'erro desconhecido');
    const msg = cleanUiMessage(raw, 'Falha ao cadastrar.');
    setError('register-error', `Falha no cadastro: ${msg}`);
  }
}
