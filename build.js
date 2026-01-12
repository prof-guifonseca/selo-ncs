/**
 * @file build.js
 * @module build
 * @description Script de build (Node) responsável por compor HTML a partir de /partials e preparar o artefato estático.
 */

// build.js
//
// Build script simples (Node.js) para gerar /dist a partir da raiz do projeto.
// Funcionalidades:
// 1) Lê index.html (template)
// 2) Substitui includes HTML do tipo: <!-- include: name -->
//    onde "name" corresponde a arquivos em /partials (name.html)
// 3) Suporta subpastas em /partials (ex.: sections/landing/hero -> partials/sections/landing/hero.html)
// 4) Suporta includes recursivos (partials podem incluir outras partials)
// 5) Gera /dist limpo e escreve dist/index.html
// 6) Copia assets opcionais: /styles, /images, /src, /docs e arquivos comuns
//
// Observação: este script é síncrono por simplicidade (adequado para builds pequenos).

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Lê arquivo texto (utf8).
 * @param {string} filePath
 * @returns {string}
 */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Escreve arquivo texto garantindo diretório.
 * @param {string} filePath
 * @param {string} content
 * @returns {void}
 */
function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Copia arquivo garantindo diretório destino.
 * @param {string} src
 * @param {string} dest
 * @returns {void}
 */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Copia diretório recursivamente (sync), preservando estrutura.
 * @param {string} src
 * @param {string} dest
 * @returns {void}
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else copyFile(srcPath, destPath);
  }
}

/**
 * Normaliza o nome do include para bater com a chave do partialMap.
 * Aceita (tolerância):
 * - "foo" -> "foo"
 * - "foo.html" -> "foo"
 * - "/foo" -> "foo"
 * - "./foo" -> "foo"
 * - "foo/" -> "foo" (remove barra final)
 * @param {string} raw
 * @returns {string}
 */
function normalizeIncludeName(raw) {
  let name = String(raw || '').trim();

  // remove prefixos comuns
  name = name.replace(/^\.\/+/, '');
  name = name.replace(/^\/+/, '');

  // remove barra final
  name = name.replace(/\/+$/, '');

  // remove .html se vier explicitamente
  name = name.replace(/\.html$/i, '');

  return name;
}

/**
 * Injeta partials em um HTML, substituindo comentários do tipo:
 *   <!-- include: nome-ou-caminho -->
 *
 * Suporta:
 * - Subpastas em /partials (key = caminho relativo sem .html, ex.: sections/landing/hero)
 * - Includes recursivos (partials podem incluir outras partials)
 *
 * Observação:
 * - Includes não resolvidos permanecem no HTML final (com warning).
 *
 * @param {string} html
 * @param {string} partialsDir
 * @param {string} [inputIndexPath] - usado só para mensagens de warning
 * @returns {string}
 */
function injectPartials(html, partialsDir, inputIndexPath = '') {
  if (!fs.existsSync(partialsDir)) return html;

  /** @type {Map<string, string>} */
  const partialMap = new Map();

  /**
   * Indexa todas as partials (.html) recursivamente.
   * @param {string} dir
   * @returns {void}
   */
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.html')) continue;

      const rel = path.relative(partialsDir, full).replace(/\\/g, '/');
      const key = rel.replace(/\.html$/i, '');
      const content = readText(full).trimEnd() + '\n';
      partialMap.set(key, content);
    }
  }

  walk(partialsDir);

  // Resolve includes por múltiplos passes (permite includes em partials)
  const includeRe = /<!--\s*include:\s*([^\s]+)\s*-->/g;
  const MAX_PASSES = 30;

  let out = html;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    out = out.replace(includeRe, (m0, rawName) => {
      const name = normalizeIncludeName(rawName);
      if (!name) return m0;

      const partial = partialMap.get(name);
      if (partial == null) return m0;

      changed = true;
      return partial;
    });

    if (!changed) break;
  }

  // Warnings para includes não resolvidos
  includeRe.lastIndex = 0; // segurança (regex global)
  const unresolved = [...out.matchAll(includeRe)]
    .map((m2) => normalizeIncludeName(m2[1]))
    .filter(Boolean);

  if (unresolved.length) {
    const shown = unresolved.slice(0, 30);
    console.warn(
      `Aviso: ${unresolved.length} include(s) não resolvido(s) em ${path.basename(inputIndexPath || 'index.html')}:`,
      shown.join(', ') + (unresolved.length > shown.length ? ' ...' : '')
    );
  }

  return out;
}

/**
 * Remove e recria um diretório (limpo).
 * @param {string} dirPath
 * @returns {void}
 */
function resetDir(dirPath) {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Copia um diretório se existir; caso contrário, emite aviso.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {string} warnMessage
 * @returns {void}
 */
function copyDirIfExists(srcDir, destDir, warnMessage) {
  if (fs.existsSync(srcDir)) copyDir(srcDir, destDir);
  else if (warnMessage) console.warn(warnMessage);
}

/**
 * Executa o build local gerando /dist.
 * @returns {void}
 */
function build() {
  const root = __dirname;

  // Lê versão do package.json (SemVer) para cache‑busting.  Se o
  // arquivo ou propriedade não existirem, cai para '0.0.0'.  Essa
  // variável será usada para derivar sufixos ?v=<version> em assets e
  // para inserir um stamp no HTML final.
  let pkgVersion = '0.0.0';
  try {
    const pkgRaw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const pkgJson = JSON.parse(pkgRaw);
    if (pkgJson && typeof pkgJson.version === 'string') {
      pkgVersion = String(pkgJson.version).trim();
    }
  } catch {
    // ignore
  }

  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('[build] index.html não encontrado na raiz do projeto.');
  }

  // 1) Lê o index template
  const indexHtml = readText(indexPath);

  // 2) Injeta partials
  const partialsDir = path.join(root, 'partials');
  const html = injectPartials(indexHtml, partialsDir, indexPath);

  // 2.1) Aplica cache‑busting determinístico.  Este passo
  // insere ?v=<version> em referências locais de CSS/JS (styles/ e src/)
  // e adiciona um meta tag + script com a versão no HTML final.
  let finalHtml = (function applyCacheBust(content, version) {
    if (!content || typeof content !== 'string') return content;
    let out = content;
    // Aplica ?v=<version> em CSS dentro de atributo href="..." para arquivos em styles/
    out = out.replace(/href="([^"]*?styles\/[^"\?]+)(?:\?[^\"]*)?"/g, (m, p1) => {
      return `href="${p1}?v=${version}"`;
    });
    // Aplica ?v=<version> em módulos JS dentro de atributo src="..." para arquivos em src/
    out = out.replace(/src="([^"]*?src\/[^"\?]+\.js)(?:\?[^\"]*)?"/g, (m, p1) => {
      return `src="${p1}?v=${version}"`;
    });
    // Injeta meta e var global antes de </head>
    out = out.replace(/<\/head>/i, () => {
      return `  <meta name="ncs-build-version" content="${version}">\n  <script>window.__NCS_BUILD={version:"${version}"};</script>\n</head>`;
    });
    return out;
  })(html, pkgVersion);

  // 3) Cria dist limpo
  const distDir = path.join(root, 'dist');
  resetDir(distDir);

  // 4) Escreve dist/index.html montado
  writeText(path.join(distDir, 'index.html'), finalHtml);

  // 5) Copia pastas de assets (styles/, images/) se existirem
  copyDirIfExists(
    path.join(root, 'styles'),
    path.join(distDir, 'styles'),
    '[build] Pasta /styles não encontrada. CSS pode não carregar.'
  );
  copyDirIfExists(
    path.join(root, 'images'),
    path.join(distDir, 'images'),
    '[build] Pasta /images não encontrada. Logos/imagens podem falhar.'
  );

  // 6) Copia src/ para dist/src (para manter <script type="module" src="src/main.js">)
  copyDirIfExists(
    path.join(root, 'src'),
    path.join(distDir, 'src'),
    '[build] Pasta /src não encontrada. JS pode não carregar.'
  );

  // 7) Copia arquivos opcionais comuns (se existirem)
  for (const file of ['favicon.ico', 'robots.txt', 'sitemap.xml']) {
    const p = path.join(root, file);
    if (fs.existsSync(p)) copyFile(p, path.join(distDir, file));
  }

  // 8) Alerta se ainda sobrou include não resolvido
  if (/<!--\s*include:\s*[^>]+-->/.test(html)) {
    console.warn('[build] Atenção: ainda existem includes não resolvidos em dist/index.html.');
  }

  // 9) Copia documentação (docs/) se existir.
  copyDirIfExists(path.join(root, 'docs'), path.join(distDir, 'docs'), '');

  // 9.1) Copia pacotes de marca (brands/) para o dist.  Este passo é
  // essencial para habilitar o white‑label no front, pois o loader de marca
  // busca config.json e brand.css a partir de /brands/<name>/.  Se a pasta
  // não existir, nada é copiado.
  copyDirIfExists(path.join(root, 'brands'), path.join(distDir, 'brands'), '');

  console.log('[build] OK: dist gerado com index + assets + src.');
}

build();
