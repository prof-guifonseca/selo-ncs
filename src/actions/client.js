/**
 * @file src/actions/client.js
 * @module actions/client
 * @description Módulo de ações do participante (client) – placeholder.
 *
 * Este módulo atualmente não contém implementações próprias. Todas as
 * ações continuam centralizadas em `src/actions.js`, mas este arquivo
 * existe para permitir uma futura modularização sem quebrar compatibilidade.
 *
 * Exporta:
 * - handlers: Objeto vazio para handlers específicos do cliente.
 */

// Importa todos os handlers e seleciona apenas aqueles cujo nome começa com
// 'client-'. Estes handlers dizem respeito a ações do participante.
import { handlers as allHandlers } from './handlers.js';

const selected = {};
for (const [key, fn] of Object.entries(allHandlers)) {
  if (key.startsWith('client-')) {
    selected[key] = fn;
  }
}

export const handlers = selected;