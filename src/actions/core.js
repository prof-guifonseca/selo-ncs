/**
 * @file src/actions/core.js
 * @module actions/core
 * @description Implementação central do dispatcher de ações via data-action.
 *
 * Este módulo compõe os handlers provenientes de módulos específicos de
 * escopo (`common.js`, `client.js`, `auditor.js` e `admin.js`) e expõe a
 * função `handleAction` responsável por despachar ações declaradas em
 * elementos DOM através do atributo `data-action`.  A composição dos
 * handlers em um único objeto garante que exista uma única fonte de
 * verdade, reduzindo o risco de regressões causadas por duplicação de
 * código ou implementação divergente.
 *
 * Ao importar este módulo, outros componentes podem acessar o
 * `handleAction` sem conhecer o layout dos módulos internos.  Adicionalmente,
 * o objeto de handlers composto é exposto para depuração em tempo de
 * desenvolvimento via `window.__NCS_ACTIONS__`.
 */

// Importa conjuntos de handlers específicos por contexto.  Cada módulo
// expõe um objeto `handlers` contendo apenas as ações sob sua
// responsabilidade.  A ordem de importação define a precedência em caso
// de chaves duplicadas: handlers definidos posteriormente sobrescrevem
// os anteriores, mas um aviso será emitido em tempo de execução.
import * as common from './common.js';
import * as client from './client.js';
import * as auditor from './auditor.js';
import * as admin from './admin.js';

// Importa helpers de baixo nível da implementação de handlers.  Apenas
// algumas funções são necessárias aqui para lidar com erros de handlers
// e mostrar mensagens de feedback ao usuário.
import { safeCall, toast } from './handlers.js';

/**
 * Compoe os handlers de todos os contextos em um único objeto.  A
 * composição é feita iterando explicitamente sobre cada conjunto e
 * detectando chaves duplicadas.  Em caso de duplicação, a função
 * sobrescreve o valor anterior e emite um aviso no console.  Isso evita
 * que múltiplas implementações do mesmo action coexistam sem que os
 * desenvolvedores percebam.
 *
 * @returns {Record<string, Function>} Objeto de handlers agregados
 */
function composeHandlers() {
  const list = [common.handlers, client.handlers, auditor.handlers, admin.handlers];
  /** @type {Record<string, Function>} */
  const result = {};
  for (const group of list) {
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(group)) {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        // Em ambiente de desenvolvimento, emita um aviso quando uma action
        // é sobrescrita.  Isso ajuda a detectar colisões acidentais.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[actions] ação duplicada detectada: '${key}' será sobrescrita`);
        }
      }
      result[key] = group[key];
    }
  }
  return result;
}

// O conjunto final de handlers agregados.  Ele é criado de forma
// preguiçosa na primeira importação; se precisar ser recomposto
// dinamicamente, mova para dentro de handleAction.
const handlers = composeHandlers();

/**
 * Dispatcher central de ações.  Pode ser chamado de duas formas:
 *  - `handleAction('action-name', el, event)`
 *  - `handleAction(event)` diretamente como listener de eventos
 *
 * A função identifica o action a partir do primeiro argumento ou do
 * atributo `data-action` do elemento alvo do evento e, em seguida,
 * procura por um handler correspondente no objeto `handlers`.  Se
 * encontrado, o handler é executado com um objeto de contexto contendo
 * a action, o elemento e o evento.  Qualquer exceção lançada pelo
 * handler é capturada para evitar que erros não tratados quebrem a
 * propagação de eventos.
 *
 * @param {string|Event|any} actionOrEvent Nome da ação ou o próprio evento
 * @param {HTMLElement|null|undefined} maybeEl Elemento associado (opcional)
 * @param {Event|null|undefined} maybeEvent Evento associado (opcional)
 * @returns {Promise<any>}
 */
export async function handleAction(actionOrEvent, maybeEl, maybeEvent) {
  // Determinar se o primeiro argumento é um evento ou uma string
  const event = actionOrEvent instanceof Event ? actionOrEvent : maybeEvent;
  // Preferir explicitamente o elemento resolvido pelo delegador (closest)
  // quando fornecido. Isso evita que handlers recebam um nó interno (ex.: <span>)
  // e percam acesso a dataset/atributos declarados no elemento com data-action.
  const explicitEl =
    typeof HTMLElement !== 'undefined' && maybeEl instanceof HTMLElement ? /** @type {HTMLElement} */ (maybeEl) : null;
  const targetEl = event && event.target instanceof HTMLElement ? event.target : null;
  // No modo legado (handleAction(event)), tente subir até o elemento que
  // realmente declara o data-action.
  const delegatedEl = targetEl?.closest?.('[data-action]') || null;
  const el = explicitEl || delegatedEl || targetEl;
  let action = '';
  if (typeof actionOrEvent === 'string') {
    action = actionOrEvent;
  } else if (el && el.dataset) {
    action = String(el.dataset.action || '');
  }
  if (!action) {
    return;
  }
  const handler = handlers[action];
  if (typeof handler !== 'function') {
    return;
  }
  try {
    // Execute o handler e retorne seu valor.  Alguns handlers retornam
    // promises, permitindo que a execução seja assíncrona.
    return await handler({ action, el, event });
  } catch (err) {
    // Utilize safeCall para garantir que qualquer toast implementado
    // externamente não cause uma nova exceção
    safeCall(() => toast('error', 'Falha ao executar ação')); 
    if (typeof console !== 'undefined' && console.error) {
      console.error('[actions] erro no handler', err);
    }
  }
}

// Exporta o objeto de handlers agregados.  Isso é útil para fins de
// depuração ou para testes unitários que precisem inspecionar os
// handlers disponíveis.  Não modifique o objeto retornado diretamente;
// em vez disso, altere os módulos individuais de actions.
export { handlers };

// Durante o desenvolvimento, exponha o conjunto de handlers no objeto
// global para facilitar a inspeção manual em tempo de execução.  Isso
// será ignorado em ambientes onde `window` não está definido (por
// exemplo, node ou testes headless).  Não utilize esta variável em
// código de produção.
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__NCS_ACTIONS__ = handlers;
}