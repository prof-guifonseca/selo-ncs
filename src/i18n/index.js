// src/i18n/index.js
//
// Implementação mínima de i18n e centralização de textos institucionais.
// Este módulo expõe um dicionário base em pt‑BR e permite a fusão de
// overrides definidos por marca (white‑label).  O helper `t()` resolve
// chaves do dicionário, com fallback para a própria chave caso não haja
// tradução, e suporta interpolação simples através de variáveis passadas
// como segundo argumento.  Também fornece `applyTemplateDeep()` para
// aplicar tokens de tradução em estruturas arbitrárias (objetos ou
// arrays), substituindo ocorrências de `{some.key}` pelo valor de
// `t('some.key')`.

import basePtBR from './ptBR.js';

// Armazena as traduções efetivas após fusão (base + overrides).
let translations = { ...basePtBR };

/**
 * Aplica overrides de tradução vindos de uma configuração de marca.
 * Os overrides têm precedência sobre as chaves base.  É seguro chamar
 * esta função várias vezes; a fusão sempre será recalculada.
 *
 * @param {Record<string, any>} overrides Objetos de override com
 * chaves planas (ponto) e valores simples.  Se null/undefined, não
 * altera as traduções.
 */
export function setBrandOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  // Merge preservando base para chaves não sobrescritas.
  translations = { ...basePtBR, ...overrides };
}

/**
 * Retorna a tradução para a chave fornecida.  Se não existir no
 * dicionário, retorna a própria chave.  Quando `vars` é passado,
 * substitui tokens no formato `{name}` por valores correspondentes em
 * `vars`.  Tokens sem valor correspondente são preservados.
 *
 * @param {string} key
 * @param {Record<string, any>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  const rawKey = String(key ?? '');
  const template = translations[rawKey] ?? rawKey;
  // Apenas se vars for fornecido faz interpolação; caso contrário,
  // retornamos a string original (que pode conter tokens de tradução
  // para serem resolvidos posteriormente via applyTemplateDeep).
  if (!vars || typeof template !== 'string') return String(template);
  return String(template).replace(/\{([^}]+)\}/g, (match, name) => {
    const k = String(name).trim();
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : match;
  });
}

/**
 * Aplica tradução recursivamente sobre strings dentro de uma estrutura.
 * Percorre objetos e arrays e, quando encontra uma string, substitui
 * tokens do tipo `{some.key}` pelo valor correspondente de `t('some.key')`.
 * Não modifica a estrutura original; retorna um novo objeto.
 *
 * @param {any} value Estrutura (objeto, array ou valor escalar)
 * @returns {any} Nova estrutura com tokens resolvidos
 */
export function applyTemplateDeep(value) {
  // Array -> mapeia recursivamente
  if (Array.isArray(value)) return value.map((v) => applyTemplateDeep(v));
  // Objeto -> percorre chaves
  if (value && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = applyTemplateDeep(v);
    }
    return result;
  }
  // String -> substitui tokens {key}
  if (typeof value === 'string') {
    return value.replace(/\{([^}]+)\}/g, (match, inner) => {
      const key = String(inner).trim();
      return t(key);
    });
  }
  // Outros tipos: retorna como está
  return value;
}

// Exporte também o dicionário atual (apenas leitura).  Útil para debug.
export function getTranslations() {
  return { ...translations };
}
