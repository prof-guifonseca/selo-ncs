/**
 * @file src/actions/admin.js
 * @module actions/admin
 * @description Módulo de ações do administrador – placeholder.
 *
 * As ações administrativas estão implementadas em `src/actions.js`. Este
 * arquivo existe como stub para uma futura decomposição em módulos sem
 * quebrar imports existentes.
 *
 * Exporta:
 * - handlers: Objeto vazio para handlers de admin.
 */

// Importa todos os handlers e seleciona apenas aqueles cujo nome começa com
// 'admin-'. Estes handlers dizem respeito a ações do gestor.
import { handlers as allHandlers } from './handlers.js';

const selected = {};
for (const [key, fn] of Object.entries(allHandlers)) {
  if (key.startsWith('admin-')) {
    selected[key] = fn;
  }
}

export const handlers = selected;