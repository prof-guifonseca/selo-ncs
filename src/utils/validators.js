/**
 * @file src/utils/validators.js
 * @description Funções utilitárias para validação de dados de entrada.
 * Utilizado principalmente nos formulários de autenticação e preenchimento de perfil.
 */

/**
 * Valida se o valor informado parece um e-mail válido.
 * Utiliza expressão regular simples conforme RFC 5322 simplificada.
 *
 * @param {string} email - A string de e-mail a ser verificada.
 * @returns {boolean} Retorna `true` se o formato for válido, caso contrário `false`.
 *
 * @example
 * validateEmail("usuario@exemplo.com"); // true
 * validateEmail("usuario@"); // false
 */
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email || '').trim());
}

/**
 * Verifica se a string informada não está vazia após a remoção de espaços (trim).
 * Útil para validar campos obrigatórios genéricos.
 *
 * @param {string} value - Valor a ser testado.
 * @returns {boolean} Retorna `true` se contiver caracteres úteis, `false` se vazio ou apenas espaços.
 */
export function validateNotEmpty(value) {
  return String(value ?? '').trim().length > 0;
}

/**
 * Função de fallback (stub) para casos onde não há validador específico.
 * Sempre retorna `true`. Mantida para compatibilidade de interfaces que exigem uma função de validação.
 *
 * @param {any} _value - Valor ignorado.
 * @returns {boolean} Sempre `true`.
 */
export function validate(_value) {
  return true;
}
