/**
 * @file src/actions/common.js
 * @module actions/common
 * @description Módulo de ações comuns (placeholder para modularização futura).
 *
 * Este arquivo é um stub que expõe um objeto `handlers` vazio. Ele existe
 * para facilitar a organização modular de actions no futuro sem quebrar
 * compatibilidade. Todas as ações continuam implementadas em `src/actions.js`.
 *
 * Exporta:
 * - handlers: Objeto vazio de handlers comuns.
 */

// Importa todos os handlers definidos no módulo central.  Este módulo
// seleciona apenas aqueles que não pertencem a contextos específicos de
// cliente, auditor ou administrador.
import { handlers as allHandlers } from './handlers.js';

const selected = {};
for (const [key, fn] of Object.entries(allHandlers)) {
  if (!key.startsWith('client-') && !key.startsWith('auditor-') && !key.startsWith('admin-')) {
    selected[key] = fn;
  }
}

export const handlers = selected;