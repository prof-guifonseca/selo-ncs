/**
 * @file src/actions/auditor.js
 * @module actions/auditor
 * @description Módulo de ações do auditor – placeholder.
 *
 * Este arquivo atualmente não contém implementações. As ações do auditor
 * permanecem definidas em `src/actions.js`. Este módulo existe para fins
 * de organização e modularização futura.
 *
 * Exporta:
 * - handlers: Objeto vazio para handlers específicos do auditor.
 */

// Importa todos os handlers e seleciona apenas aqueles cujo nome começa com
// 'auditor-'. Estes handlers dizem respeito a ações do avaliador.
import { handlers as allHandlers } from './handlers.js';

const selected = {};
for (const [key, fn] of Object.entries(allHandlers)) {
  if (key.startsWith('auditor-')) {
    selected[key] = fn;
  }
}

export const handlers = selected;