/**
 * @file src/services/api.js
 * @module services/api
 * @description Facade/DAL do front: expõe operações de alto nível consumidas por dashboards/actions.
 * Backend-only: delega para o driver HTTP (remoteDriver) e mantém snapshot em memória.
 */

import * as remoteDriver from './remoteDriver.js';
import {
  getSession as _getSession,
  saveSession as _saveSession,
  clearSession as _clearSession,
} from '../state.js';


/**
 * Snapshot em memória do estado do app retornado pelo backend.
 * @type {any|null}
 */
let __appState = null;

/* ==========================================================================
  Driver plumbing
============================================================================ */

let _driver = remoteDriver;

/**
 * Define (ou substitui) o driver de backend usado por esta facade.
 * @param {import('../types/services.js').ApiDriver} driver
 * @returns {void}
 */
export function setApiDriver(driver) {
  _driver = driver || remoteDriver;
}

function requireDriver() {
  return _driver;
}

/* ==========================================================================
  HTTP helpers (fallback quando driver não implementa algo)
============================================================================ */

async function httpFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} em ${url}${txt ? `: ${txt}` : ''}`);
    // @ts-ignore
    err.status = res.status;
    throw err;
  }
  return res;
}

async function httpJson(url, opts = {}) {
  const res = await httpFetch(url, opts);
  return await res.json();
}

async function httpText(url, opts = {}) {
  const res = await httpFetch(url, opts);
  return await res.text();
}

/* ==========================================================================
  Sessão (memória)
============================================================================ */

/**
 * Persiste sessão em memória (front).
 * @param {import('../types/core.js').Session} patch
 * @returns {void}
 */
export function saveSession(patch) {
  return _saveSession(patch || {});
}

/**
 * Limpa a sessão em memória (front).
 * @returns {void}
 */
export function clearSession() {
  return _clearSession();
}

/**
 * Retorna o snapshot atual da sessão em memória.
 * @returns {import('../types/core.js').Session}
 */
export function getSession() {
  return _getSession();
}

/**
 * Resolve o processId ativo para operações que dependem de processo.
 * Estratégia (best-effort):
 * 1) currentAuditorProcessId em sessão
 * 2) lista do backend e pega o 1º
 * @returns {Promise<string>}
 */
async function resolveActiveProcessId() {
  const s = getSession() || {};
  if (s.currentAuditorProcessId) return String(s.currentAuditorProcessId);

  const remote = await listProcesses({});
  const first = Array.isArray(remote) ? remote[0]?.id : remote?.items?.[0]?.id;
  if (first) return String(first);

  throw new Error('Nenhum processo ativo encontrado.');
}

/* ==========================================================================
  App State (payload)
============================================================================ */

/**
 * Retorna o snapshot do estado do app em memória (último loadAppState()).
 * @returns {import('../types/services.js').AppState|null}
 */
export function getAppState() {
  return __appState;
}

/**
 * Carrega o estado do app a partir do backend e atualiza o snapshot em memória.
 * @returns {Promise<import('../types/services.js').AppState>}
 */
export async function loadAppState() {
  const payload = await requireDriver().loadAppState();
  __appState = payload && typeof payload === 'object' ? payload : null;
  return payload;
}

/**
 * Salva o estado atual do snapshot em memória no backend.
 * @returns {Promise<{ok: boolean}>}
 */
export async function saveAppState() {
  const payload = __appState || {};
  return await requireDriver().saveAppState(payload);
}

/* ==========================================================================
  Auth
============================================================================ */

export async function authenticateUser({ email, password } = {}) {
  return await requireDriver().authenticateUser({ email, password });
}

/**
 * Registra um novo usuário (cliente) no backend.  Chama /api/auth/register.
 *
 * @param {{ company_name: string, email: string, password: string, accept_terms_platform: boolean, accept_terms_process: boolean }} payload
 * @returns {Promise<any>}
 */
export async function registerUser(payload = {}) {
  if (typeof requireDriver().registerUser === 'function') {
    return await requireDriver().registerUser(payload);
  }
  // fallback via fetch quando driver não implementar registerUser
  const url = `/api/auth/register`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} em ${url}${txt ? `: ${txt}` : ''}`);
    // @ts-ignore
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

export async function fetchMe() {
  return await requireDriver().me();
}

export async function logoutUser() {
  try {
    if (typeof requireDriver().logout === 'function') {
      await requireDriver().logout();
    }
  } catch {
    // best-effort
  } finally {
    clearSession();
  }
}

/* ==========================================================================
  Processes
============================================================================ */

export async function listProcesses(params) {
  return await requireDriver().listProcesses(params || {});
}

export async function getProcessById(id) {
  return await requireDriver().getProcessById(id);
}

export async function upsertProcessSubmission(payload) {
  return await requireDriver().upsertProcessSubmission(payload || {});
}

export async function updateProcessTriage(id, patch) {
  return await requireDriver().updateProcessTriage(id, patch || {});
}

export async function updateProcessAssignment(id, patch) {
  return await requireDriver().updateProcessAssignment(id, patch || {});
}

export async function updateProcessReviews(id, patch) {
  return await requireDriver().updateProcessReviews(id, patch || {});
}

export async function updateProcessDecision(id, patch) {
  return await requireDriver().updateProcessDecision(id, patch || {});
}

/**
 * Compat: reverter processo para "operation" usando upsert.
 * @param {string} id
 */
export async function resetProcessToOperation(id) {
  const proc = await getProcessById(id);
  const payload = proc && proc.payload ? proc.payload : proc;
  if (!payload || typeof payload !== 'object') throw new Error('Processo inválido para reset.');
  payload.stage = 'operation';
  payload.triage = { ...(payload.triage || {}), status: 'ready' };
  return await upsertProcessSubmission(payload);
}

/* ==========================================================================
  Auditor UX: seleção de processo atual (memória)
============================================================================ */

export function setCurrentAuditorProcess(processId) {
  saveSession({ currentAuditorProcessId: processId || null });
}

/* ==========================================================================
  Evidences
============================================================================ */

export async function listEvidence(params) {
  return await requireDriver().listEvidence(params || {});
}

export async function createEvidenceMeta(processId, meta) {
  const p = String(processId || '').trim();
  const isPillar = p === 'E' || p === 'S' || p === 'G';
  const resolvedProcessId = isPillar ? await resolveActiveProcessId() : p;

  const payload = { ...(meta || {}) };
  if (isPillar && !payload.pillar) payload.pillar = p;

  return await requireDriver().createEvidenceMeta(resolvedProcessId, payload);
}

export async function saveEvidence(evidenceId, file, meta) {
  return await requireDriver().saveEvidence(evidenceId, file, meta || {});
}

/**
 * @param {string} evidenceId
 * @returns {Promise<{blob: Blob|null, meta: any|null, url: string|null}>}
 */
export async function getEvidenceFile(evidenceId) {
  const out = await requireDriver().getEvidenceFile(evidenceId);
  if (!out) return { blob: null, meta: null, url: null };
  if (out instanceof Blob) return { blob: out, meta: null, url: null };
  if (out && typeof out === 'object' && 'url' in out) {
    return { blob: null, meta: out.meta ?? null, url: String(out.url || '') || null };
  }
  return { blob: null, meta: null, url: null };
}

/**
 * @param {string} evidenceId
 * @returns {Promise<{url: string, meta?: any} | null>}
 */
export async function getEvidenceObjectUrl(evidenceId) {
  const out = await requireDriver().getEvidenceObjectUrl(evidenceId);
  if (!out) return null;
  if (typeof out === 'string') return out ? { url: out } : null;
  if (typeof out === 'object' && 'url' in out) {
    const u = String(out.url || '').trim();
    return u ? { url: u, meta: out.meta ?? null } : null;
  }
  const u = String(out || '').trim();
  return u ? { url: u } : null;
}

export async function deleteEvidence(evidenceId) {
  return await requireDriver().deleteEvidence(evidenceId);
}

/* ==========================================================================
  Audit Log
============================================================================ */

export async function getAuditLog(processId, opts = {}) {
  return await requireDriver().getAuditLog(processId, opts || {});
}

/* ==========================================================================
  Public pages (sem login para GET)
============================================================================ */

export async function publishPublic(processId, opts = {}) {
  const pid = String(processId || '').trim();
  if (!pid) throw new Error('processId obrigatório para publishPublic().');

  const d = requireDriver();
  if (typeof d.publishPublic === 'function') {
    return await d.publishPublic(pid, opts || {});
  }

  const body = { process_id: pid, ...(opts || {}) };
  return await httpJson('/api/public/publish', { method: 'POST', body: JSON.stringify(body) });
}

export async function previewPublic(processId, format = 'html') {
  const pid = String(processId || '').trim();
  if (!pid) throw new Error('processId obrigatório para previewPublic().');

  const fmt = String(format || 'html').toLowerCase() === 'json' ? 'json' : 'html';
  const d = requireDriver();
  if (typeof d.previewPublic === 'function') {
    return await d.previewPublic(pid, fmt);
  }

  const url = `/api/public/preview?process_id=${encodeURIComponent(pid)}&format=${encodeURIComponent(fmt)}`;
  return fmt === 'json' ? await httpJson(url) : await httpText(url);
}

export async function publishPublicPage(payload) {
  const d = requireDriver();
  if (typeof d.publishPublicPage === 'function') {
    const out = await d.publishPublicPage(payload || {});
    return String(out || '');
  }

  const res = await httpJson('/api/public/publish', { method: 'POST', body: JSON.stringify(payload || {}) });
  const id = res?.public_id || res?.id || res?.slug || res?.publicId || '';
  return String(id || '');
}

export async function openPublicPage(publicId) {
  const d = requireDriver();
  if (typeof d.openPublicPage === 'function') {
    return await d.openPublicPage(publicId);
  }
  const u = String(publicId || '').trim();
  if (!u) return;
  window.open(u, '_blank', 'noopener,noreferrer');
}

/* ==========================================================================
  Pilot: ações do processo (approve, etc.)
============================================================================ */

export async function submitProcessAction(args = {}) {
  const process_id = String(args.process_id || '').trim();
  const action = String(args.action || '').trim();
  const payload = args.payload || null;

  if (!process_id) throw new Error('process_id obrigatório.');
  if (!action) throw new Error('action obrigatório.');

  const d = requireDriver();
  if (typeof d.submitProcessAction === 'function') {
    return await d.submitProcessAction({ process_id, action, payload });
  }

  try {
    return await httpJson('/api/processes/action', {
      method: 'POST',
      body: JSON.stringify({ process_id, action, payload }),
    });
  } catch (err) {
    if (action === 'approve') {
      return await updateProcessTriage(process_id, { status: 'ready_for_decision' });
    }
    throw err;
  }
}

/* ==========================================================================
  KPI / Deliverables (coerência com actions.js)
============================================================================ */

export function computeKPIs() {
  if (__appState && typeof __appState === 'object') {
    return __appState.kpis || __appState.kpi || __appState.metrics || null;
  }
  return null;
}

export async function recordDeliverable(kind) {
  const k = String(kind || '').trim();
  if (!k) return { ok: true };

  try {
    if (__appState && typeof __appState === 'object') {
      if (!Array.isArray(__appState.deliverables)) __appState.deliverables = [];
      __appState.deliverables.push({ kind: k, at: new Date().toISOString() });
    }
  } catch {}

  const d = requireDriver();
  if (typeof d.recordDeliverable === 'function') {
    try {
      return await d.recordDeliverable(k);
    } catch {
      return { ok: true };
    }
  }
  return { ok: true };
}

/* ==========================================================================
  Admin tooling (companies, memberships, auditor assignments)
============================================================================ */

export async function listCompanies() {
  return await requireDriver().listCompanies();
}

export async function createCompany(payload) {
  return await requireDriver().createCompany(payload || {});
}

export async function listMemberships(companyId) {
  return await requireDriver().listMemberships(companyId);
}

export async function createMembership(payload) {
  return await requireDriver().createMembership(payload || {});
}

/**
 * Resolve um usuário a partir do email.  Invoca a rota administrativa
 * `/admin/resolve-user` via driver atual.  Veja também a função
 * homônima em remoteDriver.js.
 *
 * @param {string} email
 * @returns {Promise<any>}
 */
export async function resolveUserByEmail(email) {
  return await requireDriver().resolveUserByEmail(email);
}

export async function updateMembership(membershipId, patch) {
  return await requireDriver().updateMembership(membershipId, patch || {});
}

export async function listAssignments(processId) {
  return await requireDriver().listAssignments(processId);
}

export async function setAssignmentsBulk(payload) {
  return await requireDriver().setAssignmentsBulk(payload || {});
}
