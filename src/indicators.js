/**
 * @file src/indicators.js
 * @module indicators
 * @description Catálogo e helpers de indicadores ESG (metadados, defaults e sincronização com estado do app).
 */

// src/indicators.js
//
// Helpers do catálogo de indicadores ESG do Selo NCS.
//
// Movimento de limpeza/aprimoramento:
// - Lookup O(1) via Map (evita .find repetido)
// - Tipagem defensiva (normalizações e defaults)
// - buildDefaultIndicators() consistente com o modelo 4.2 (principal/revisor/final)
// - syncStateWithCatalog() previsível (overlay + preservação de progresso)
// - Catálogo sem “code”: frontend trabalha com TITLE (título) como nome de exibição
//
// Observação importante (arquitetura):
// - Este módulo NÃO deve conhecer o DOM nem depender de nenhuma store específica de UI.
// - Ele só lida com: catálogo -> estado de indicadores -> sincronização.
// - A store da UI (por exemplo, dashStore) é a “fonte de persistência”; indicators.js é a “fonte de catálogo”.

import { INDICATOR_CATALOG_V0 } from './data/indicators.catalog.js';

// Budget: 351 linhas — atualize ao modificar (evita inchaço)
// -----------------------------------------------------------------------------
// Catálogo canônico (12) — a verdade do protótipo (4.2+)

/**
 * Lista canônica de IDs de indicadores (1..12).
 * Útil para iterações estáveis e validações.
 * @type {number[]}
 */
export const CANONICAL_INDICATOR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// -----------------------------------------------------------------------------
// Índices do catálogo (performance + consistência)

const RAW_LIST = Array.isArray(INDICATOR_CATALOG_V0) ? INDICATOR_CATALOG_V0 : [];

// index por id numérico (primeira ocorrência vence)
const CATALOG_BY_ID = new Map();
RAW_LIST.forEach((x) => {
  const n = Number(x?.id);
  if (!Number.isFinite(n)) return;
  if (!CATALOG_BY_ID.has(n)) CATALOG_BY_ID.set(n, x);
});

// lista canônica (12) na ordem definida; cria stub se faltar meta
const CATALOG_LIST = CANONICAL_INDICATOR_IDS.map((id) => {
  const meta = CATALOG_BY_ID.get(id);
  if (meta) return meta;

  // stub defensivo (não deveria acontecer; evita crash)
  return {
    id,
    title: `Indicador ${id}`,
    pillar: null,
    category: null,
    categoryLabel: '',
    theme: '',
    question: '',
    tooltip: '',
  };
});

// Compatibilidade (apenas para migrar snapshots antigos que guardavam `code`)
const LEGACY_CODE_TO_ID = {
  'E-GEE-01': 1,
  'E-ENE-02': 2,
  'E-RES-03': 3,
  'E-AGU-04': 4,
  'S-TRAB-01': 5,
  'S-DIV-02': 6,
  'S-CAD-03': 7,
  'S-COM-04': 8,
  'G-GOV-01': 9,
  'G-ETI-02': 10,
  'G-DPO-03': 11,
  'G-RIS-04': 12,
};

// -----------------------------------------------------------------------------
// Helpers internos

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function toNumberId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function toCanonicalIdFromLegacy(old) {
  // old pode ser objeto (indicador) ou valor bruto (id/code)
  if (old == null) return null;

  // 0) se vier valor bruto (string/number), tenta direto
  if (typeof old === 'string' || typeof old === 'number') {
    const n = toNumberId(old);
    if (n != null && CATALOG_BY_ID.has(n)) return n;
    const code = String(old).trim();
    if (code && LEGACY_CODE_TO_ID[code]) return LEGACY_CODE_TO_ID[code];
    return null;
  }

  // 1) tenta id numérico direto
  const byId = toNumberId(old?.id);
  if (byId != null && CATALOG_BY_ID.has(byId)) return byId;

  // 2) tenta “indicatorId” (muitos snapshots guardam assim)
  const byIndicatorId = toNumberId(old?.indicatorId);
  if (byIndicatorId != null && CATALOG_BY_ID.has(byIndicatorId)) return byIndicatorId;

  // 3) tenta “code” antigo -> id
  const code = String(old?.code || '').trim();
  if (code && LEGACY_CODE_TO_ID[code]) return LEGACY_CODE_TO_ID[code];

  // 4) tenta “key”/“indicatorCode” antigos, se existirem
  const alt = String(old?.indicatorCode || old?.key || '').trim();
  if (alt && LEGACY_CODE_TO_ID[alt]) return LEGACY_CODE_TO_ID[alt];

  return null;
}

function normalizeStatus(value) {
  const s0 = String(value || '').trim();
  if (!s0) return 'Pendente';

  const low = s0
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (low === 'nao se aplica' || low === 'naoseaplica') return 'Não se aplica';
  if (low === 'pendente') return 'Pendente';
  if (low === 'validado') return 'Validado';
  if (low === 'negado') return 'Negado';
  if (low === 'condicionante') return 'Condicionante';

  // mantém rótulo original se for algo fora do conjunto, mas evita vazio
  return s0 || 'Pendente';
}

function detectNA(old) {
  if (!old || typeof old !== 'object') return false;
  const st = (k) => normalizeStatus(old?.[k]);
  return !!(
    old.notApplicable ||
    old.isNotApplicable ||
    st('status') === 'Não se aplica' ||
    st('statusPrincipal') === 'Não se aplica' ||
    st('statusRevisor') === 'Não se aplica' ||
    st('statusFinal') === 'Não se aplica'
  );
}

/**
 * Nome de exibição: APENAS título (sem códigos).
 */
function makeDisplayName(meta) {
  const title = String(meta?.title || meta?.name || '').trim();
  return title || 'Indicador';
}

/**
 * Prepara um objeto de indicador (state) a partir do meta do catálogo.
 * Campos 4.2:
 * - statusPrincipal / statusRevisor / statusFinal
 * - notePrincipal / noteRevisor / noteFinal
 *
 * Mantém alguns campos legados para compatibilidade (status/points/NA),
 * mas NÃO usa nem depende de code.
 */
function makeDefaultIndicatorState(meta) {
  const title = makeDisplayName(meta);

  return {
    id: Number(meta.id),

    // Exibição e classificação (do catálogo)
    title,
    name: title, // compat com UI antiga que usa "name"
    pillar: meta.pillar ?? null,
    category: meta.category ?? null,
    categoryLabel: meta.categoryLabel ?? '',
    theme: meta.theme ?? '',
    question: meta.question ?? '',
    tooltip: meta.tooltip ?? '',

    // Avaliador principal
    statusPrincipal: 'Pendente',
    notePrincipal: '',

    // Avaliador revisor
    statusRevisor: 'Pendente',
    noteRevisor: '',

    // Final (consenso/inferência no computeKPIs)
    statusFinal: null, // pode virar string quando houver consenso
    noteFinal: '',

    // Compatibilidade legado (sem codes)
    status: 'Pendente',
    points: 0,
    notApplicable: false,
    notApplicableReason: '',
    isNotApplicable: false,
    statusBeforeNA: null,
  };
}

// -----------------------------------------------------------------------------
// API pública

/**
 * Retorna o meta do catálogo para um id.
 * Aceita id numérico ou string numérica.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
export function getIndicatorMetaById(id) {
  const n = toNumberId(id);
  if (n == null) return null;
  return CATALOG_BY_ID.get(n) || null;
}

/**
 * Constrói a lista “default” de indicadores (state) com base no catálogo atual.
 *
 * @returns {Array<object>}
 */
export function buildDefaultIndicators() {
  return CATALOG_LIST.map((m) => makeDefaultIndicatorState(m));
}

/**
 * Sincroniza appState.indicators com o catálogo:
 * - Mantém progresso do que existe (status/notes/NA/points)
 * - Remove indicadores que não existem mais no catálogo
 * - Adiciona indicadores novos com defaults
 *
 * Regra de migração (overlay previsível):
 * - Se existir statusPrincipal no snapshot, preserva.
 * - Se não existir, usa o legado `status` como statusPrincipal.
 * - statusRevisor preserva se existir (senão default).
 * - statusFinal preserva se vier explicitamente (senão null).
 * - NA: se detectado, força NA em principal/revisor/final e preserva reason.
 *
 * Observação: a “verdade” do TÍTULO vem do catálogo; não aceita título antigo salvo.
 *
 * @param {object} appState
 */
export function syncStateWithCatalog(appState) {
  if (!isPlainObject(appState)) return;

  const existing = Array.isArray(appState.indicators) ? appState.indicators : [];

  // indexa existentes por id canônico
  const existingById = new Map();
  existing.forEach((x) => {
    const id = toCanonicalIdFromLegacy(x);
    if (id == null) return;
    if (!existingById.has(id)) existingById.set(id, x);
  });

  // monta a lista canônica (ordem do catálogo) com overlay do progresso
  const nextIndicators = CATALOG_LIST.map((meta) => {
    const base = makeDefaultIndicatorState(meta);
    const old = existingById.get(base.id);

    if (!old || typeof old !== 'object') return base;

    const oldNA = detectNA(old);

    const oldPoints = Number(old.points);
    const hasPoints = Number.isFinite(oldPoints);

    // Status por role
    const statusPrincipal = normalizeStatus(old.statusPrincipal || old.status || base.statusPrincipal);
    const statusRevisor = normalizeStatus(old.statusRevisor || base.statusRevisor);

    // statusFinal: preserva se veio como algo “definido”, senão null
    const hasExplicitFinal =
      old.statusFinal !== undefined && old.statusFinal !== null && String(old.statusFinal).trim() !== '';
    const statusFinal = hasExplicitFinal ? normalizeStatus(old.statusFinal) : null;

    // Notes por role
    const naReason = String(old.notApplicableReason || old.naReason || old.reason || '').trim();

    const notePrincipal = String(old.notePrincipal || old.note || '').trim();
    const noteRevisor = String(old.noteRevisor || '').trim();
    const noteFinal = String(old.noteFinal || '').trim();

    // Compatibilidade: status legado acompanha o principal
    const legacyStatus = normalizeStatus(old.status || statusPrincipal || base.status);

    return {
      ...base,

      // preserva progresso
      points: hasPoints ? oldPoints : base.points,

      // legado/NA
      status: oldNA ? 'Não se aplica' : legacyStatus,
      notApplicable: oldNA,
      isNotApplicable: oldNA,
      notApplicableReason: naReason,
      statusBeforeNA: old.statusBeforeNA ?? null,

      // 4.2 roles
      statusPrincipal: oldNA ? 'Não se aplica' : statusPrincipal,
      statusRevisor: oldNA ? 'Não se aplica' : statusRevisor,
      statusFinal: oldNA ? 'Não se aplica' : statusFinal,

      // notas (se NA e não tiver nota, injeta reason)
      notePrincipal: notePrincipal || (oldNA ? naReason : ''),
      noteRevisor,
      noteFinal,
    };
  });

  appState.indicators = nextIndicators;

  // ---------------------------------------------------------------------------
  // Limpeza opcional: remover evidências legadas associadas a indicadores inexistentes no catálogo.
  const validIds = new Set(nextIndicators.map((i) => Number(i.id)));

  // Caso exista appState.evidence como objeto { [indicatorId]: [...] }
  if (appState.evidence && typeof appState.evidence === 'object') {
    Object.keys(appState.evidence).forEach((k) => {
      const id = Number(k);
      if (Number.isFinite(id) && !validIds.has(id)) delete appState.evidence[k];
    });
  }

  // Caso exista appState.evidences como lista com indicatorId
  if (Array.isArray(appState.evidences)) {
    appState.evidences = appState.evidences.filter((ev) => {
      const id = toNumberId(ev?.indicatorId);
      // mantém se não estiver ligado a indicador (ev solta) OU se for válido
      if (id == null) return true;
      return validIds.has(id);
    });
  }
}

