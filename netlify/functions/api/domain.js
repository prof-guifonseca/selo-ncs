// netlify/functions/api/domain.js
//
// Utility functions for domain logic on the backend.  This module
// currently exposes a computeKPIs helper which is responsible for
// calculating process KPIs based on the status of individual
// indicators.  The implementation mirrors the legacy logic from
// the frontend computeKPIs helper but operates purely on the
// data passed in via arguments.  This decouples KPI calculation
// from any in‑memory client state and makes the backend the single
// source of truth for scoring and consensus detection.

"use strict";

// Mapping of human readable statuses to numeric values.  These
// correspond to 100% (Validado), 50% (Condicionante) and 0% for
// Negado/Pendente.  A null value represents a non‑applicable
// indicator.
const STATUS_VALUES = {
  Validado: 1,
  Condicionante: 0.5,
  Negado: 0,
  Pendente: 0,
  'Não se aplica': null,
};

// Certain indicators are considered critical.  A direct conflict on
// these (e.g. principal says Validado and reviewer says Negado)
// automatically marks the process as having a disparity requiring
// consensus.
const CRITICAL_INDICATOR_IDS = [10, 11];

// When the principal and reviewer average scores differ by more than
// this many percentage points the process is considered to have a
// disparity.
const DISPARITY_THRESHOLD_PP = 20;

/**
 * Normalises a status string into one of the recognised labels.
 * Falls back to 'Pendente' when the input is falsy.  Handles
 * case and accent variations.
 *
 * @param {any} value
 * @returns {'Validado'|'Condicionante'|'Negado'|'Pendente'|'Não se aplica'}
 */
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
  return s0 || 'Pendente';
}

/**
 * Compute the final indicator score (0..100) using the 50/50 rule
 * between the principal and reviewer.  When either side is NA or
 * Pendente the result is null.
 *
 * @param {{ statusPrincipal?: any, statusRevisor?: any }} ind
 * @returns {number|null}
 */
function computeIndicatorFinalScore(ind) {
  if (!ind) return null;
  const sp = normalizeStatus(ind.statusPrincipal);
  const sr = normalizeStatus(ind.statusRevisor);
  if (sp === 'Não se aplica' || sr === 'Não se aplica') return null;
  if (sp === 'Pendente' || sr === 'Pendente') return null;
  const a = Object.prototype.hasOwnProperty.call(STATUS_VALUES, sp) ? STATUS_VALUES[sp] : 0;
  const b = Object.prototype.hasOwnProperty.call(STATUS_VALUES, sr) ? STATUS_VALUES[sr] : 0;
  if (a == null || b == null) return null;
  return Math.round(((a + b) / 2) * 100);
}

/**
 * Classify the final status based on the final score and the
 * underlying status values.  When an indicator is NA the class is
 * 'NA', otherwise a null score yields 'Pendente'.
 *
 * @param {number|null} score
 * @param {{ statusPrincipal?: any, statusRevisor?: any }} ind
 * @returns {'Validado'|'Condicionante'|'Negado'|'Pendente'|'NA'}
 */
function classifyFinalStatus(score, ind) {
  const sp = normalizeStatus(ind?.statusPrincipal);
  const sr = normalizeStatus(ind?.statusRevisor);
  if (sp === 'Não se aplica' || sr === 'Não se aplica') return 'NA';
  if (score == null) return 'Pendente';
  if (score === 100) return 'Validado';
  if (score === 0) return 'Negado';
  return 'Condicionante';
}

/**
 * Compute KPI metrics for a process given its list of indicators.  Each
 * indicator should at minimum have an id, pillar and status fields
 * (statusPrincipal/statusRevisor).  Indicators missing a pillar are
 * still scored but will not contribute to per‑pillar totals.  The
 * output mirrors the structure returned by the frontend’s
 * computeKPIs implementation.
 *
 * @param {Array<any>} indicators
 * @returns {any}
 */
function computeKPIs(indicators) {
  const inds = Array.isArray(indicators) ? indicators : [];
  const pillars = ['E', 'S', 'G'];
  // initialise aggregators
  const statusCounts = { Validado: 0, Condicionante: 0, Negado: 0, Pendente: 0, NA: 0 };
  const gaps = { E: 0, S: 0, G: 0 };
  const gapsAll = { E: 0, S: 0, G: 0 };
  const pillarSumDecided = { E: 0, S: 0, G: 0 };
  const pillarCountDecided = { E: 0, S: 0, G: 0 };
  const pillarSumConservative = { E: 0, S: 0, G: 0 };
  const pillarCountConservative = { E: 0, S: 0, G: 0 };
  const pSum = { E: 0, S: 0, G: 0 };
  const pCount = { E: 0, S: 0, G: 0 };
  const rSum = { E: 0, S: 0, G: 0 };
  const rCount = { E: 0, S: 0, G: 0 };
  let hasCriticalConflict = false;
  /** @type {Record<string, {finalScore: number|null, finalClass: string, pillar: string|null}>} */
  const indicatorScores = {};
  /** @type {Record<string, boolean>} */
  const requiresConsensusById = {};

  // helper to normalise id keys
  const toKey = (id) => String(id || '').trim();

  inds.forEach((raw) => {
    if (!raw) return;
    const ind = Object.assign({}, raw);
    const idKey = toKey(ind.id);
    // determine pillar either from indicator or null
    const pillar = ind.pillar != null ? String(ind.pillar) : null;
    const finalScore = computeIndicatorFinalScore(ind);
    const finalClass = classifyFinalStatus(finalScore, ind);
    indicatorScores[idKey] = { finalScore, finalClass, pillar };
    if (statusCounts[finalClass] !== undefined) statusCounts[finalClass] += 1;

    if (pillar && gaps[pillar] != null) {
      if (finalClass === 'Pendente' || finalClass === 'Negado') gaps[pillar] += 1;
      if (finalClass !== 'Validado' && finalClass !== 'NA') gapsAll[pillar] += 1;
    }
    if (pillar) {
      if (finalScore != null) {
        pillarSumDecided[pillar] += finalScore;
        pillarCountDecided[pillar] += 1;
      }
      const sp0 = normalizeStatus(ind.statusPrincipal);
      const sr0 = normalizeStatus(ind.statusRevisor);
      const isNA = sp0 === 'Não se aplica' || sr0 === 'Não se aplica';
      if (!isNA) {
        pillarCountConservative[pillar] += 1;
        pillarSumConservative[pillar] += finalScore == null ? 0 : finalScore;
      }
    }
    const sp = normalizeStatus(ind.statusPrincipal);
    const sr = normalizeStatus(ind.statusRevisor);
    const vp = Object.prototype.hasOwnProperty.call(STATUS_VALUES, sp) ? STATUS_VALUES[sp] : 0;
    const vr = Object.prototype.hasOwnProperty.call(STATUS_VALUES, sr) ? STATUS_VALUES[sr] : 0;
    if (pillar) {
      if (sp !== 'Não se aplica' && sp !== 'Pendente' && vp != null) {
        pSum[pillar] += vp * 100;
        pCount[pillar] += 1;
      }
      if (sr !== 'Não se aplica' && sr !== 'Pendente' && vr != null) {
        rSum[pillar] += vr * 100;
        rCount[pillar] += 1;
      }
    }
    if (CRITICAL_INDICATOR_IDS.includes(Number(ind.id))) {
      const conflict = (sp === 'Validado' && sr === 'Negado') || (sp === 'Negado' && sr === 'Validado');
      if (conflict) hasCriticalConflict = true;
    }
  });
  const scorePorPilarDecidido = {};
  const scorePorPilarConservador = {};
  let sumDec = 0;
  let cntDec = 0;
  let sumCons = 0;
  let cntCons = 0;
  pillars.forEach((p) => {
    const dec = pillarCountDecided[p] > 0 ? pillarSumDecided[p] / pillarCountDecided[p] : 0;
    const cons = pillarCountConservative[p] > 0 ? pillarSumConservative[p] / pillarCountConservative[p] : 0;
    scorePorPilarDecidido[p] = Math.round(dec);
    scorePorPilarConservador[p] = Math.round(cons);
    sumDec += dec;
    cntDec += 1;
    sumCons += cons;
    cntCons += 1;
  });
  const scoreTotalDecidido = cntDec > 0 ? Math.round(sumDec / cntDec) : 0;
  const scoreTotal = cntCons > 0 ? Math.round(sumCons / cntCons) : 0;
  const roleScore = (sumMap, countMap) => {
    let sum = 0;
    let cnt = 0;
    pillars.forEach((p) => {
      const avg = countMap[p] > 0 ? sumMap[p] / countMap[p] : 0;
      sum += avg;
      cnt += 1;
    });
    return cnt > 0 ? sum / cnt : 0;
  };
  const principalScore = roleScore(pSum, pCount);
  const revisorScore = roleScore(rSum, rCount);
  const disparity = Math.abs(principalScore - revisorScore) > DISPARITY_THRESHOLD_PP || hasCriticalConflict;
  if (disparity) {
    inds.forEach((i) => {
      const sp = normalizeStatus(i?.statusPrincipal);
      const sr = normalizeStatus(i?.statusRevisor);
      requiresConsensusById[toKey(i?.id)] = sp !== sr;
    });
  } else {
    inds.forEach((i) => {
      requiresConsensusById[toKey(i?.id)] = false;
    });
  }
  return {
    pendentes: statusCounts.Pendente,
    conformes: statusCounts.Validado,
    pontos: scoreTotal,
    scoreTotal,
    scoreTotalDecidido,
    scorePorPilar: scorePorPilarConservador,
    scorePorPilarDecidido,
    statusCounts,
    gaps,
    gapsAll,
    principalScore: Math.round(principalScore),
    revisorScore: Math.round(revisorScore),
    disparity,
    hasCriticalConflict,
    indicatorScores,
    requiresConsensusById,
  };
}

module.exports = { computeKPIs };