/**
 * @file src/utils/once.js
 * @module utils/once
 * @description Helpers for idempotent event listener installation.
 *
 * Exporta:
 * - installOnce: Registra um event listener no alvo apenas uma vez por handler.
 */

// Mapa fraco para armazenar quais handlers já foram instalados em cada target.
const _installed = new WeakMap();

/**
 * Registra um event listener no alvo somente se o mesmo handler ainda não foi registrado.
 * Isto evita binds duplicados quando o boot ou inicialização é invocado múltiplas vezes.
 *
 * @param {EventTarget|null|undefined} target Elemento ou objeto que aceita addEventListener.
 * @param {string} type Tipo de evento (ex.: 'click').
 * @param {EventListenerOrEventListenerObject} handler Função ou objeto que manipula o evento.
 * @param {boolean|AddEventListenerOptions} [options] Opções do addEventListener (opcional).
 */
export function installOnce(target, type, handler, options) {
  if (!target || typeof target.addEventListener !== 'function' || !type || !handler) return;
  let events = _installed.get(target);
  if (!events) {
    events = new Map();
    _installed.set(target, events);
  }
  let handlers = events.get(type);
  if (!handlers) {
    handlers = new Set();
    events.set(type, handlers);
  }
  // Para evitar duplicatas, verifica se o mesmo handler já foi registrado.
  if (handlers.has(handler)) return;
  handlers.add(handler);
  target.addEventListener(type, handler, options);
}