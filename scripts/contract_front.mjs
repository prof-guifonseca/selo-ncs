#!/usr/bin/env node
// @ts-check
/*
 * scripts/contract_front.mjs
 *
 * Contrato de integridade do front-end para o Selo NCS.
 *
 * Este script roda após o build e valida a consistência entre o roteador,
 * o DOM renderizado e a definição de ações e modais. Ele foi inspirado
 * no script de smoke test e mantém a filosofia de zero dependências,
 * utilizando apenas o Node.js padrão para leitura e inspeção de arquivos.
 *
 * Regras validadas:
 *
 * 1) Todas as views privadas declaradas em src/router.js existem no DOM
 *    resultante (dist/index.html), verificadas pelo padrão id="<view>-view".
 * 2) Todos os valores de data-action no HTML têm registro no objeto
 *    __actionsForSmokeTest de src/actions.js. Essa verificação garante
 *    que não haja ações “fantasmas” que nunca chegam aos handlers.
 * 3) Todos os valores de data-view usados para navegação possuem uma view
 *    correspondente no DOM (id="<view>-view").
 * 4) Todos os valores de data-modal existentes no HTML têm uma entrada
 *    definida em modalContent (src/ui.js). Se uma chave de modal não
 *    estiver definida, o usuário verá conteúdo indisponível em runtime;
 *    portanto, a ausência aqui é considerada erro.
 * 5) Alguns elementos críticos (ancoras do layout e componentes raiz)
 *    devem sempre estar presentes no HTML final. A lista curta a seguir
 *    justifica‑se por serem ganchos de acessibilidade ou pontos de
 *    inicialização da aplicação: main-content (conteúdo principal),
 *    nav-menu (navegação), info-modal/modal-title/modal-body (estrutura
 *    base do modal global) e footer-program-title (titulo institucional).
 *
 * Se alguma regra for violada, o script imprime mensagens claras e
 * retorna exit(1), bloqueando o pipeline de CI. Em caso de sucesso,
 * imprime um resumo das verificações realizadas.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Escapa caracteres especiais para uso em uma expressão regular.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  // Assume que o script é executado a partir da raiz do projeto.
  const root = process.cwd();
  const distIndexPath = path.join(root, 'dist', 'index.html');
  const routerPath = path.join(root, 'src', 'router.js');
  const actionsPath = path.join(root, 'src', 'actions.js');
  const uiPath = path.join(root, 'src', 'ui.js');

  /** @type {Array<{type: string, msg: string}>} */
  const errors = [];

  // Verifica existência do dist/index.html.
  if (!existsSync(distIndexPath)) {
    console.error('[contract:front] Erro: dist/index.html não encontrado. Execute "npm run build" antes.');
    process.exit(1);
  }

  // Carrega os arquivos necessários.
  const [indexHtml, routerJs, actionsJs, uiJs] = await Promise.all([
    fs.readFile(distIndexPath, 'utf8'),
    fs.readFile(routerPath, 'utf8'),
    fs.readFile(actionsPath, 'utf8'),
    fs.readFile(uiPath, 'utf8'),
  ]);

  /*
   * 1) Views privadas: extrai valores do Set PRIVATE_VIEWS em router.js.
   */
  /** @type {Set<string>} */
  const privateViews = new Set();
  {
    const m = routerJs.match(/PRIVATE_VIEWS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/m);
    if (m) {
      const arr = m[1];
      const re = /['"]([^'"\s]+)['"]\s*/g;
      let mm;
      while ((mm = re.exec(arr)) !== null) {
        privateViews.add(mm[1]);
      }
    }
  }
  for (const view of privateViews) {
    const idName = `${view}-view`;
    const re = new RegExp(`id\s*=\s*["']${escapeRegex(idName)}["']`, 'i');
    if (!re.test(indexHtml)) {
      errors.push({ type: 'private-view', msg: `view privada não encontrada no DOM: ${view} (esperava id="${idName}")` });
    }
  }

  /*
   * 2) Ações declaradas: extrai chaves do objeto __actionsForSmokeTest em actions.js.
   */
  /** @type {Set<string>} */
  const actionKeys = new Set();
  {
    const m = actionsJs.match(/__actionsForSmokeTest\s*=\s*{([\s\S]*?)}/m);
    if (m) {
      const body = m[1];
      const re = /['"]([^'"\n]+?)['"]\s*:/g;
      let mm;
      while ((mm = re.exec(body)) !== null) {
        actionKeys.add(mm[1].trim());
      }
    }
  }
  /** @type {Set<string>} */
  const dataActions = new Set();
  {
    const re = /\bdata-action\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
    let mm;
    while ((mm = re.exec(indexHtml)) !== null) {
      const val = (mm[1] || mm[2] || mm[3] || '').trim();
      if (val) dataActions.add(val);
    }
  }
  for (const act of dataActions) {
    if (!actionKeys.has(act)) {
      errors.push({ type: 'data-action', msg: `data-action sem registro encontrado: ${act}` });
    }
  }

  /*
   * 3) data-view: cada valor precisa ter um container correspondente.
   */
  /** @type {Set<string>} */
  const dataViews = new Set();
  {
    const re = /\bdata-view\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
    let mm;
    while ((mm = re.exec(indexHtml)) !== null) {
      const val = (mm[1] || mm[2] || mm[3] || '').trim();
      if (val) dataViews.add(val);
    }
  }
  for (const view of dataViews) {
    const idName = `${view}-view`;
    const re = new RegExp(`id\s*=\s*["']${escapeRegex(idName)}["']`, 'i');
    if (!re.test(indexHtml)) {
      errors.push({ type: 'data-view', msg: `data-view alvo sem view no DOM: ${view} (esperava id="${idName}")` });
    }
  }

  /*
   * 4) Modais: extrai chaves de modalContent e valida data-modal.
   */
  /** @type {Set<string>} */
  const modalKeys = new Set();
  {
    const m = uiJs.match(/const\s+modalContent\s*=\s*{([\s\S]*?)};/m);
    if (m) {
      const body = m[1];
      // Captura chaves no formato 'foo': ou "foo": ou sem aspas (foo:).
      const re = /['"]([^'"\n]+?)['"]\s*:|\b([A-Za-z0-9_-]+)\s*:/g;
      let mm;
      while ((mm = re.exec(body)) !== null) {
        const key = (mm[1] || mm[2] || '').trim();
        if (key) modalKeys.add(key);
      }
    }
  }
  /** @type {Set<string>} */
  const dataModals = new Set();
  {
    const re = /\bdata-modal\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
    let mm;
    while ((mm = re.exec(indexHtml)) !== null) {
      const val = (mm[1] || mm[2] || mm[3] || '').trim();
      if (val) dataModals.add(val);
    }
  }
  for (const mod of dataModals) {
    if (!modalKeys.has(mod)) {
      errors.push({ type: 'data-modal', msg: `data-modal sem conteúdo encontrado: ${mod}` });
    }
  }

  /*
   * 5) IDs críticos: verificam existência de elementos indispensáveis.
   */
  const criticalIds = [
    'main-content',
    'nav-menu',
    'info-modal',
    'modal-title',
    'modal-body',
    'footer-program-title',
  ];
  for (const cid of criticalIds) {
    const re = new RegExp(`id\s*=\s*["']${escapeRegex(cid)}["']`, 'i');
    if (!re.test(indexHtml)) {
      errors.push({ type: 'critical-id', msg: `Elemento crítico ausente: id="${cid}"` });
    }
  }

  // Reporte de resultados
  if (errors.length) {
    console.error(`[contract:front] Falha em ${errors.length} item(ns).`);
    for (const err of errors) {
      console.error(`- ${err.type}: ${err.msg}`);
    }
    process.exit(1);
  } else {
    console.log(
      `[contract:front] OK — ${privateViews.size} views privadas, ${dataActions.size} actions, ${dataViews.size} views navegáveis, ${dataModals.size} modais, ${criticalIds.length} IDs críticos.`
    );
  }
}

main().catch((err) => {
  console.error('[contract:front] Erro inesperado:', err);
  process.exit(1);
});