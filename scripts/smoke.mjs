#!/usr/bin/env node
// @ts-nocheck
/**
 * scripts/smoke.mjs
 *
 * Smoke test “pitch-safe” (zero deps) para capturar regressões que quebram demo/deploy.
 * Roda com: node scripts/smoke.mjs
 *
 * Filosofia:
 * - Falhar só no que é objetivamente “quebra”: arquivo inexistente, contrato DOM quebrado, assets faltando.
 * - Evitar falso positivo: ignora comentários HTML, ignora rotas “SPA” sem extensão, ignora externos/data/blob.
 * - Mensagens úteis: o erro aponta o arquivo e o motivo.
 *
 * Checks (profissional):
 * A) dist sanity:
 *   1) dist/index.html existe
 *   2) assets referenciados por HTML existem em dist/ (href/src/srcset/poster)
 *   3) assets referenciados por CSS existem em dist/ (url(...) e @import) [somente CSS referenciado]
 *   4) sourceMappingURL (JS/CSS) -> .map existe (quando presente)
 *   5) manifest.json (se referenciado) -> JSON válido e ícones existem
 * B) contratos DOM (por HTML):
 *   6) IDs duplicados
 *   7) aria-controls -> id inexistente (suporta lista por espaço)
 * C) contratos de ações (somente index.html):
 *   8) data-action -> handler em src/actions.js (whitelist explícita)
 * D) netlify:
 *   9) redirects para /.netlify/functions/<name> -> function existe (respeita [functions].directory)
 *  10) function file parece exportar handler (suporta CommonJS e ESM) [strict opcional]
 * E) documentação (benefício da “documentação ampla”):
 *  11) Verifica se funções Netlify e scripts críticos preservam documentação mínima (JSDoc e cabeçalho)
 *      - Ajuda a evitar regressões “silenciosas” onde a base documentada volta a ficar opaca.
 *      - Por padrão gera WARNINGS; em STRICT vira ERRO.
 *
 * Saída:
 * - Falha: lista erros + exit(1) (barra deploy)
 * - OK: imprime “[smoke] OK …”
 *
 * Flags:
 * O script não lê mais variáveis de ambiente para controlar o modo de execução.
 * Se desejar executar em modo estrito (warnings viram erro) ou desativar as
 * validações de documentação, ajuste as constantes `STRICT` e `CHECK_DOCS`
 * definidas no início deste arquivo.
 */

import { promises as fs } from 'fs';
import path from 'path';

/* ============================================================================
  Config
============================================================================ */

// Ações permitidas que NÃO possuem handler implementado (placeholders do piloto)
// Ações permitidas que NÃO possuem handler implementado (placeholders do piloto).
// Nenhuma ação deve ser listada aqui no passo 2, pois as ações do piloto foram implementadas.
const ALLOWED_MISSING_ACTIONS = [];

// Extensões aceitáveis para functions Netlify (evita falso erro em .mjs/.ts)
const FUNCTION_EXTS = ['.js', '.mjs', '.cjs', '.ts'];

// Prefixos de URL a ignorar ao validar existência de arquivo
const IGNORE_URL_PREFIXES = [
  'http://',
  'https://',
  '//',
  'data:',
  'blob:',
  'javascript:',
  'mailto:',
  'tel:',
  '#',
];

// Rotas “não-arquivo” que podem aparecer em href/src (ex.: endpoints)
const IGNORE_PATH_PREFIXES = ['/api/', '/.netlify/'];

// Tipos “arquivo” que valem validação mesmo sem heurística de extensão
const FORCE_FILE_PATHS = new Set(['/manifest.json', '/site.webmanifest', '/robots.txt', '/sitemap.xml']);

// Strict mode (warnings viram erro).
// A partir de agora, não utilizamos mais variáveis de ambiente para controlar
// o modo strict; ajuste esta constante diretamente se quiser mudar o nível de
// severidade.
const STRICT = false;

// Docs mode (on por padrão).
// Da mesma forma, este flag não depende de variáveis de ambiente.  Defina
// para false para pular validações de documentação.
const CHECK_DOCS = true;

/* ============================================================================
  Helpers: time / formatting
============================================================================ */

/** @returns {number} */
function nowMs() {
  return Date.now();
}

/** @param {number} ms @returns {string} */
function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/* ============================================================================
  Result model (shared)
============================================================================ */

/**
 * @typedef {{ type: string, where: string, msg: string }} Issue
 */

/* ============================================================================
  FS helpers
============================================================================ */

/** @param {string} filePath @returns {Promise<string|null>} */
async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} filePath @returns {Promise<Buffer|null>} */
async function readBufIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

/** @param {string} filePath @returns {Promise<boolean>} */
async function existsAbs(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk recursivo (abs), retornando apenas arquivos.
 * @param {string} rootAbs
 * @returns {Promise<string[]>}
 */
async function walkDirAbs(rootAbs) {
  const out = [];

  /** @param {string} dir @returns {Promise<void>} */
  async function rec(dir) {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of ents) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) await rec(abs);
      else out.push(abs);
    }
  }

  await rec(rootAbs);
  return out;
}

/** @param {string} p @returns {string} */
function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

/** @param {string} fromAbs @param {string} toAbs @returns {string} */
function relPosix(fromAbs, toAbs) {
  return toPosix(path.relative(fromAbs, toAbs));
}

/* ============================================================================
  Parsing helpers: HTML attrs / URLs / TOML
============================================================================ */

/** @param {string} html @returns {string} */
function stripHtmlComments(html) {
  // Remove <!-- ... --> para não ler atributos dentro de comentários.
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Captura valores de atributo:
 * - attr="x" | attr='x' | attr=x (unquoted até espaço/>)
 * @param {string} html
 * @param {string} attrName
 * @returns {string[]}
 */
function extractAttrValues(html, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'gi');
  const values = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    values.push(String((m[1] ?? m[2] ?? m[3] ?? '')).trim());
  }
  return values;
}

/** @param {string} u @returns {string} */
function stripQueryAndHash(u) {
  return String(u || '').split('#')[0].split('?')[0];
}

/** @param {string} raw @returns {boolean} */
function shouldIgnoreUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return true;

  const lower = u.toLowerCase();
  for (const p of IGNORE_URL_PREFIXES) {
    if (lower.startsWith(p)) return true;
  }
  for (const p of IGNORE_PATH_PREFIXES) {
    if (u.startsWith(p)) return true;
  }
  return false;
}

/** @param {string} raw @returns {string} */
function normalizeUrl(raw) {
  const u = stripQueryAndHash(String(raw || '').trim());
  if (!u) return '';
  return u.replace(/\\/g, '/');
}

/**
 * Heurística: evita falso positivo para rotas SPA ("/login", "/dashboard"...).
 * Considera "arquivo" se:
 * - tem extensão (ponto no último segmento)
 * - OU está na lista de caminhos forçados
 * - OU é docs/*.html
 * @param {string} url
 * @returns {boolean}
 */
function looksLikeFilePath(url) {
  if (!url) return false;

  const u = url.startsWith('/') ? url : '/' + url;
  if (FORCE_FILE_PATHS.has(u)) return true;

  const clean = normalizeUrl(url);
  if (!clean) return false;

  if (/^\/?docs\/.+\.html$/i.test(clean)) return true;

  const last = clean.split('/').pop() || '';
  return last.includes('.') && !last.endsWith('.');
}

/**
 * Resolve uma referência (relativa/absoluta do site) para um caminho absoluto dentro de dist/.
 * - ref começando com "/" => distRootAbs/<ref>
 * - ref relativa => baseDirAbs/<ref>
 * @param {string} distRootAbs
 * @param {string} ref
 * @param {string} baseDirAbs
 * @returns {string|null}
 */
function resolveRefToAbs(distRootAbs, ref, baseDirAbs) {
  const clean = normalizeUrl(ref);
  if (!clean) return null;

  if (clean.startsWith('/')) return path.join(distRootAbs, clean.slice(1));
  return path.join(baseDirAbs, clean);
}

/**
 * Parseia srcset, retornando apenas os URLs.
 * @param {string} srcset
 * @returns {string[]}
 */
function parseSrcset(srcset) {
  const out = [];
  const s = String(srcset || '').trim();
  if (!s) return out;

  for (const part of s.split(',')) {
    const token = part.trim().split(/\s+/)[0];
    if (token) out.push(token.trim());
  }
  return out;
}

/**
 * Extrai referências de assets locais em HTML:
 * - href, src, poster, srcset
 * @param {string} html
 * @returns {string[]}
 */
function extractLocalAssetRefsFromHtml(html) {
  const refs = [];

  const hrefs = extractAttrValues(html, 'href');
  const srcs = extractAttrValues(html, 'src');
  const posters = extractAttrValues(html, 'poster');
  const srcsets = extractAttrValues(html, 'srcset').flatMap(parseSrcset);

  for (const raw of [...hrefs, ...srcs, ...posters, ...srcsets]) {
    if (shouldIgnoreUrl(raw)) continue;
    const clean = normalizeUrl(raw);
    if (!clean) continue;
    if (!looksLikeFilePath(clean)) continue;
    refs.push(clean);
  }

  // Dedup
  const out = [];
  const seen = new Set();
  for (const r of refs) {
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

/**
 * Encontra <link rel="manifest" href="...">.
 * @param {string} html
 * @returns {string|null}
 */
function extractManifestHref(html) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rels = extractAttrValues(tag, 'rel')
      .flatMap((r) => r.split(/\s+/))
      .map((x) => x.toLowerCase());

    if (!rels.includes('manifest')) continue;

    const href = extractAttrValues(tag, 'href')[0];
    if (href && !shouldIgnoreUrl(href)) {
      const clean = normalizeUrl(href);
      if (clean && looksLikeFilePath(clean)) return clean;
    }
  }
  return null;
}

/**
 * Lê [functions].directory do netlify.toml (parser regex simples, zero deps).
 * @param {string} toml
 * @returns {string}
 */
function getNetlifyFunctionsDir(toml) {
  const re = /^\[functions\][\s\S]*?^\s*directory\s*=\s*["']([^"']+)["']/m;
  const m = toml.match(re);
  return m ? String(m[1]).trim() : 'netlify/functions';
}

/**
 * Extrai nomes de functions a partir de redirects para /.netlify/functions/<name>.
 * @param {string} toml
 * @returns {string[]}
 */
function extractNetlifyFunctionNamesFromRedirects(toml) {
  const re = /\bto\s*=\s*["']\/\.netlify\/functions\/([^"'\/\s]+)["']/g;
  const names = [];
  let m;
  while ((m = re.exec(toml)) !== null) names.push(m[1]);
  return names;
}

/* ============================================================================
  CSS parsing
============================================================================ */

/** @param {string} css @returns {string} */
function stripCssComments(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extrai refs locais de CSS (url(...) e @import).
 * @param {string} cssText
 * @returns {string[]}
 */
function extractCssRefs(cssText) {
  const css = stripCssComments(cssText);
  const refs = [];

  // url(...)
  const urlRe = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi;
  let m;
  while ((m = urlRe.exec(css)) !== null) {
    const u = String((m[1] ?? m[2] ?? m[3] ?? '')).trim();
    if (u && !shouldIgnoreUrl(u) && looksLikeFilePath(u)) refs.push(u);
  }

  // @import
  const importRe =
    /\@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)|"([^"]*)"|'([^']*)')\s*;?/gi;
  while ((m = importRe.exec(css)) !== null) {
    const u = String((m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '')).trim();
    if (u && !shouldIgnoreUrl(u) && looksLikeFilePath(u)) refs.push(u);
  }

  // Dedup
  const out = [];
  const seen = new Set();
  for (const r of refs) {
    const clean = normalizeUrl(r);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/* ============================================================================
  Source map checks
============================================================================ */

/**
 * Extrai sourceMappingURL, suportando:
 * - //# sourceMappingURL=...
 * - /*# sourceMappingURL=... *\/
 *
 * Retorna o ÚLTIMO sourceMappingURL encontrado (o mais relevante).
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractSourceMappingUrl(text) {
  const t = String(text || '');

  const lineRe = /\/\/#\s*sourceMappingURL\s*=\s*([^\s]+)\s*$/gm;
  const blockRe = /\/\*#\s*sourceMappingURL\s*=\s*([^\s*]+)\s*\*\//gm;

  /** @type {string|null} */
  let last = null;

  let m;
  while ((m = lineRe.exec(t)) !== null) last = String(m[1]).trim();
  while ((m = blockRe.exec(t)) !== null) last = String(m[1]).trim();

  return last || null;
}

/* ============================================================================
  Checks: DOM / actions / assets
============================================================================ */

/**
 * @param {string} html
 * @param {string} label
 * @param {Issue[]} errors
 */
function checkDuplicateIdsInHtml(html, label, errors) {
  const ids = extractAttrValues(html, 'id').filter(Boolean);
  const count = new Map();
  for (const id of ids) count.set(id, (count.get(id) || 0) + 1);

  const dup = Array.from(count.entries()).filter(([, c]) => c > 1);
  if (dup.length) {
    errors.push({
      type: 'dom:duplicate-id',
      where: label,
      msg: 'IDs duplicados: ' + dup.map(([id, c]) => `${id} (x${c})`).join(', '),
    });
  }
}

/**
 * @param {string} html
 * @param {string} label
 * @param {Issue[]} errors
 */
function checkAriaControlsInHtml(html, label, errors) {
  const ids = new Set(extractAttrValues(html, 'id').filter(Boolean));
  const targets = extractAttrValues(html, 'aria-controls');

  for (const target of targets) {
    if (!target || target === '#') continue;
    const parts = String(target).split(/\s+/).filter(Boolean);
    for (const p of parts) {
      if (!ids.has(p)) {
        errors.push({
          type: 'a11y:aria-controls',
          where: label,
          msg: `aria-controls aponta para id inexistente: ${p}`,
        });
      }
    }
  }
}

/** @param {string} str @returns {string} */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Valida se data-action no index tem handler implementado em src/actions.js.
 * @param {string} indexHtml
 * @param {string} actionsJs
 * @param {Issue[]} errors
 */
function checkDataActions(indexHtml, actionsJs, errors) {
  const actions = new Set(extractAttrValues(indexHtml, 'data-action').filter(Boolean));

  for (const act of actions) {
    if (ALLOWED_MISSING_ACTIONS.includes(act)) continue;

    const k = escapeRegex(act);
    const patterns = [
      new RegExp(`["'\`]${k}["'\`]\\s*:`), // map/object key
      new RegExp(`\\b${k}\\s*:`), // bare key
      new RegExp(`\\bcase\\s+["'\`]${k}["'\`]\\s*:`), // switch/case
      new RegExp(`\\b(?:action|act)\\s*===\\s*["'\`]${k}["'\`]`), // comparisons
    ];

    const ok = patterns.some((re) => re.test(actionsJs));
    if (!ok) {
      errors.push({
        type: 'contract:data-action',
        where: 'dist/index.html',
        msg: `data-action sem handler encontrado: ${act}`,
      });
    }
  }
}

/**
 * Converte abs (dist) em key estilo "/x/y.ext" para lookup rápido.
 * @param {string} distRootAbs
 * @param {string} abs
 * @returns {string}
 */
function fileKeyFromAbs(distRootAbs, abs) {
  const rel = relPosix(distRootAbs, abs);
  return '/' + rel.replace(/^\/+/, '');
}

/**
 * @param {string} html
 * @param {string} htmlAbs
 * @param {string} distRootAbs
 * @param {Set<string>} distFilesSet
 * @param {Issue[]} errors
 */
function checkHtmlAssetsExist(html, htmlAbs, distRootAbs, distFilesSet, errors) {
  const baseDirAbs = path.dirname(htmlAbs);
  const refs = extractLocalAssetRefsFromHtml(html);

  for (const ref of refs) {
    const abs = resolveRefToAbs(distRootAbs, ref, baseDirAbs);
    if (!abs) continue;

    const key = fileKeyFromAbs(distRootAbs, abs);
    if (!distFilesSet.has(key)) {
      errors.push({
        type: 'assets:html',
        where: relPosix(distRootAbs, htmlAbs),
        msg: `Asset referenciado no HTML não existe em dist/: ${ref}`,
      });
    }
  }
}

/**
 * @param {string} cssAbs
 * @param {string} distRootAbs
 * @param {Set<string>} distFilesSet
 * @param {Issue[]} errors
 * @returns {Promise<void>}
 */
async function checkCssAssetsExist(cssAbs, distRootAbs, distFilesSet, errors) {
  const cssText = await readFileIfExists(cssAbs);
  if (cssText == null) {
    errors.push({
      type: 'assets:css',
      where: fileKeyFromAbs(distRootAbs, cssAbs),
      msg: 'CSS referenciado não pôde ser lido.',
    });
    return;
  }

  const baseDirAbs = path.dirname(cssAbs);
  const refs = extractCssRefs(cssText);

  for (const ref of refs) {
    const abs = resolveRefToAbs(distRootAbs, ref, baseDirAbs);
    if (!abs) continue;

    const key = fileKeyFromAbs(distRootAbs, abs);
    if (!distFilesSet.has(key)) {
      errors.push({
        type: 'assets:css',
        where: fileKeyFromAbs(distRootAbs, cssAbs),
        msg: `Asset referenciado no CSS não existe em dist/: ${ref}`,
      });
    }
  }
}

/**
 * @param {string} fileAbs
 * @param {string} distRootAbs
 * @param {Set<string>} distFilesSet
 * @param {Issue[]} errors
 * @returns {Promise<void>}
 */
async function checkSourceMapForFile(fileAbs, distRootAbs, distFilesSet, errors) {
  const buf = await readBufIfExists(fileAbs);
  if (!buf) return;

  const text = buf.toString('utf8');
  const sm = extractSourceMappingUrl(text);
  if (!sm) return;

  if (shouldIgnoreUrl(sm)) return;

  const clean = normalizeUrl(sm);
  if (!clean) return;

  const baseDirAbs = path.dirname(fileAbs);
  const mapAbs = resolveRefToAbs(distRootAbs, clean, baseDirAbs);
  if (!mapAbs) return;

  const key = fileKeyFromAbs(distRootAbs, mapAbs);
  if (!distFilesSet.has(key)) {
    errors.push({
      type: 'assets:sourcemap',
      where: fileKeyFromAbs(distRootAbs, fileAbs),
      msg: `sourceMappingURL aponta para .map ausente: ${clean}`,
    });
  }
}

/**
 * @param {string} indexHtml
 * @param {string} indexAbs
 * @param {string} distRootAbs
 * @param {Set<string>} distFilesSet
 * @param {Issue[]} errors
 * @returns {Promise<void>}
 */
async function checkManifest(indexHtml, indexAbs, distRootAbs, distFilesSet, errors) {
  const manifestRef = extractManifestHref(indexHtml);
  if (!manifestRef) return;

  const baseDirAbs = path.dirname(indexAbs);
  const manifestAbs = resolveRefToAbs(distRootAbs, manifestRef, baseDirAbs);
  if (!manifestAbs) return;

  const key = fileKeyFromAbs(distRootAbs, manifestAbs);
  if (!distFilesSet.has(key)) {
    errors.push({
      type: 'pwa:manifest',
      where: 'dist/index.html',
      msg: `Manifest referenciado não existe em dist/: ${manifestRef}`,
    });
    return;
  }

  const raw = await readFileIfExists(manifestAbs);
  if (!raw) {
    errors.push({
      type: 'pwa:manifest',
      where: manifestRef,
      msg: 'Manifest não pôde ser lido.',
    });
    return;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    errors.push({
      type: 'pwa:manifest',
      where: manifestRef,
      msg: 'Manifest JSON inválido.',
    });
    return;
  }

  // Valida icons: se existir, apontar para arquivos existentes
  const icons = Array.isArray(json.icons) ? json.icons : [];
  const manifestDirAbs = path.dirname(manifestAbs);

  for (const icon of icons) {
    if (!icon || typeof icon !== 'object') continue;
    const src = String(icon.src || '').trim();
    if (!src || shouldIgnoreUrl(src)) continue;

    const clean = normalizeUrl(src);
    if (!clean || !looksLikeFilePath(clean)) continue;

    const iconAbs = resolveRefToAbs(distRootAbs, clean, manifestDirAbs);
    if (!iconAbs) continue;

    const iconKey = fileKeyFromAbs(distRootAbs, iconAbs);
    if (!distFilesSet.has(iconKey)) {
      errors.push({
        type: 'pwa:manifest',
        where: manifestRef,
        msg: `Manifest icon ausente em dist/: ${src}`,
      });
    }
  }
}

/* ============================================================================
  Checks: Netlify functions
============================================================================ */

/**
 * Verifica redirects em netlify.toml que apontam para /.netlify/functions/<name>.
 * - Confirma se arquivo existe no diretório de functions
 * - Confirma (heurística) se o arquivo parece exportar "handler"
 *
 * @param {string|null} netlifyToml
 * @param {string} projectRoot
 * @param {Issue[]} errors
 * @param {Issue[]} warnings
 * @returns {Promise<{ functionsDir: string, fnNames: string[], found: Array<{ name: string, abs: string }> }>}
 */
async function checkNetlifyFunctions(netlifyToml, projectRoot, errors, warnings) {
  const result = { functionsDir: 'netlify/functions', fnNames: [], found: [] };
  if (!netlifyToml) return result;

  const functionsDir = getNetlifyFunctionsDir(netlifyToml);
  const fnNames = extractNetlifyFunctionNamesFromRedirects(netlifyToml);
  result.functionsDir = functionsDir;
  result.fnNames = fnNames;

  for (const fnName of fnNames) {
    let foundAbs = null;

    for (const ext of FUNCTION_EXTS) {
      const abs = path.join(projectRoot, functionsDir, `${fnName}${ext}`);
      if (await existsAbs(abs)) {
        foundAbs = abs;
        break;
      }
    }

    if (!foundAbs) {
      errors.push({
        type: 'netlify:function-missing',
        where: 'netlify.toml',
        msg: `Função inexistente para redirect: ${fnName} (esperado em ${functionsDir}/${fnName}.{js,mjs,cjs,ts})`,
      });
      continue;
    }

    result.found.push({ name: fnName, abs: foundAbs });

    // Checagem “handler export” (warnings por padrão; vira erro em STRICT)
    const code = await readFileIfExists(foundAbs);
    if (code) {
      const ok =
        /exports\.handler\s*=/.test(code) ||
        /module\.exports\s*=\s*\{\s*handler\s*:/.test(code) ||
        /module\.exports\.handler\s*=/.test(code) ||
        /\bexport\s+async\s+function\s+handler\b/.test(code) ||
        /\bexport\s+function\s+handler\b/.test(code) ||
        /\bexport\s+const\s+handler\b/.test(code) ||
        /\bexport\s+\{\s*handler\s*\}/.test(code);

      if (!ok) {
        const item = {
          type: 'netlify:function-handler',
          where: path.join(functionsDir, path.basename(foundAbs)),
          msg: 'Função existe, mas não parece exportar "handler" (CommonJS/ESM).',
        };
        if (STRICT) errors.push(item);
        else warnings.push(item);
      }
    }
  }

  return result;
}

/* ============================================================================
  Checks: API driver coverage (extra)
============================================================================ */

/**
 * Garante que mockDriver implementa o conjunto de funções que api.js delega.
 * (Resiliente: regex simples, zero deps).
 *
 * @param {string|null} apiJs
 * @param {string|null} mockDriverJs
 * @param {Issue[]} errors
 */
function checkApiDriverMockCoverage(apiJs, mockDriverJs, errors) {
  if (!apiJs || !mockDriverJs) return;

  const delegated = new Set();
  const rxDelegated = /typeof\s+apiDriver\.([A-Za-z0-9_]+)\s*===\s*['"]function['"]/g;
  let m;
  while ((m = rxDelegated.exec(apiJs))) delegated.add(m[1]);

  const mockFns = new Set();
  const rxMock = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  while ((m = rxMock.exec(mockDriverJs))) mockFns.add(m[1]);

  const missing = [...delegated].filter((fn) => !mockFns.has(fn));
  if (missing.length) {
    errors.push({
      type: 'api-driver',
      where: 'src/services/api.js',
      msg: `mockDriver não implementa o conjunto delegado pelo api.js: ${missing.join(', ')}`,
    });
  }
}

/* ============================================================================
  Checks: Documentation coverage (NEW)
============================================================================ */

/**
 * Extrai o primeiro bloco JSDoc que precede um padrão (ex.: exports.handler = ...).
 * @param {string} code
 * @param {RegExp} exportPattern
 * @returns {string|null}
 */
function extractJsdocBeforeExport(code, exportPattern) {
  const re = new RegExp(`(\\/\\*\\*[\\s\\S]*?\\*\\/)[\\s\\r\\n]*(${exportPattern.source})`, 'm');
  const m = String(code || '').match(re);
  return m ? String(m[1]) : null;
}

/**
 * Verifica se o arquivo tem um cabeçalho “humano” no topo (comentário antes do código).
 * Regra conservadora: após shebang (se houver), a primeira linha útil deve começar com // ou /*.
 *
 * @param {string} code
 * @returns {boolean}
 */
function hasFileHeaderComment(code) {
  const lines = String(code || '').split(/\r?\n/);

  let i = 0;
  if (lines[0] && lines[0].startsWith('#!')) i = 1;

  // pula linhas vazias
  while (i < lines.length && !String(lines[i]).trim()) i++;

  const first = String(lines[i] || '').trim();
  return first.startsWith('//') || first.startsWith('/*');
}

/**
 * Checa se há "use strict" no topo (primeiras ~25 linhas).
 * @param {string} code
 * @returns {boolean}
 */
function hasUseStrictNearTop(code) {
  const head = String(code || '').split(/\r?\n/).slice(0, 25).join('\n');
  return /['"]use strict['"]\s*;/.test(head);
}

/**
 * Heurística: valida se a documentação mínima foi preservada:
 * - Cabeçalho de arquivo (comentário no topo)
 * - Para Netlify functions: JSDoc antes do export do handler com @param e @returns
 * - Para arquivos CommonJS: "use strict" (quando esperado)
 * - Para arquivos “documentados”: presença de @typedef import (quando esperado)
 *
 * Por padrão gera WARNING; em STRICT vira ERRO.
 *
 * @param {{ rel: string, abs: string, kind: 'netlify-function'|'script', expectUseStrict?: boolean, expectTypedefImport?: boolean }} target
 * @param {string} code
 * @param {Issue[]} errors
 * @param {Issue[]} warnings
 */
function checkDocumentationForTarget(target, code, errors, warnings) {
  const push = (issue) => {
    if (STRICT) errors.push(issue);
    else warnings.push(issue);
  };

  // Cabeçalho no topo
  if (!hasFileHeaderComment(code)) {
    push({
      type: 'docs:header',
      where: target.rel,
      msg: 'Arquivo sem cabeçalho/comentário inicial (perde contexto de manutenção).',
    });
  }

  // use strict (quando esperado)
  if (target.expectUseStrict && !hasUseStrictNearTop(code)) {
    push({
      type: 'docs:use-strict',
      where: target.rel,
      msg: "Esperado 'use strict' próximo ao topo (padrão adotado nos módulos documentados).",
    });
  }

  // typedef import (quando esperado)
  if (target.expectTypedefImport) {
    const ok = /@typedef\s+\{\s*import\(['"]@netlify\/functions['"]\)\./.test(code);
    if (!ok) {
      push({
        type: 'docs:typedef',
        where: target.rel,
        msg: "Esperado @typedef import('@netlify/functions') para tipagem JSDoc (DX/consistência).",
      });
    }
  }

  // handler doc (apenas netlify functions)
  if (target.kind === 'netlify-function') {
    // reconhece CommonJS e ESM
    const exportPattern = /(?:exports\.handler\s*=|module\.exports\.handler\s*=|\bexport\s+(?:async\s+)?function\s+handler\b|\bexport\s+const\s+handler\b|\bexport\s+\{\s*handler\s*\})/;
    const doc = extractJsdocBeforeExport(code, exportPattern);

    if (!doc) {
      push({
        type: 'docs:handler-jsdoc',
        where: target.rel,
        msg: 'Função sem JSDoc imediatamente antes do export do handler (perde contrato e orientação).',
      });
      return;
    }

    const hasParam = /@param\b/.test(doc);
    const hasReturns = /@returns?\b/.test(doc);

    if (!hasParam || !hasReturns) {
      push({
        type: 'docs:handler-jsdoc',
        where: target.rel,
        msg: 'JSDoc do handler deve incluir @param e @returns (contrato/documentação mínima).',
      });
    }
  }
}

/**
 * Executa checks de documentação em targets relevantes:
 * - Netlify functions encontradas via redirects (netlify.toml)
 * - Scripts críticos (build.js) para manter padrão de manutenção
 *
 * @param {string} projectRoot
 * @param {{ functionsDir: string, found: Array<{ name: string, abs: string }> }} netlifyFnInfo
 * @param {Issue[]} errors
 * @param {Issue[]} warnings
 * @returns {Promise<void>}
 */
async function checkProjectDocumentation(projectRoot, netlifyFnInfo, errors, warnings) {
  if (!CHECK_DOCS) return;

  /** @type {Array<{ rel: string, abs: string, kind: 'netlify-function'|'script', expectUseStrict?: boolean, expectTypedefImport?: boolean }>} */
  const targets = [];

  // Netlify functions (a partir de redirects) — é onde a documentação “de contrato” é mais valiosa
  for (const fn of netlifyFnInfo.found || []) {
    const rel = toPosix(path.relative(projectRoot, fn.abs));
    targets.push({
      rel,
      abs: fn.abs,
      kind: 'netlify-function',
      // a nossa base higienizada usa 'use strict' e typedef import nos handlers Netlify
      expectUseStrict: /\.(js|cjs)$/i.test(fn.abs),
      expectTypedefImport: true,
    });
  }

  // Scripts/documentos críticos do repo (mantém benefício do investimento em docs)
  const buildAbs = path.join(projectRoot, 'build.js');
  if (await existsAbs(buildAbs)) {
    targets.push({
      rel: 'build.js',
      abs: buildAbs,
      kind: 'script',
      expectUseStrict: true,
      expectTypedefImport: false,
    });
  }

  for (const t of targets) {
    const code = await readFileIfExists(t.abs);
    if (!code) {
      // Se sumiu, é regressão real (especialmente para functions referenciadas em redirects)
      const issue = {
        type: 'docs:missing-file',
        where: t.rel,
        msg: 'Arquivo alvo de documentação não pôde ser lido (pode indicar remoção/regressão).',
      };
      if (STRICT) errors.push(issue);
      else warnings.push(issue);
      continue;
    }

    checkDocumentationForTarget(t, code, errors, warnings);
  }
}

/* ============================================================================
  Checks: promessas de pitch (presign/commit)
============================================================================ */

/**
 * Detecta stubs que quebrariam o "pitch-safe" do upload grande.
 * - Fora do STRICT: vira WARNING
 * - Em STRICT=1: vira ERROR
 *
 * @param {string} projectRoot
 * @param {Issue[]} errors
 * @param {Issue[]} warnings
 */
async function checkLargeUploadStubs(projectRoot, errors, warnings) {
  const fnAbs = path.join(projectRoot, 'netlify', 'functions', 'api.js');
  const raw = await readFileIfExists(fnAbs);
  if (!raw) return;

  const hasPresignStub = /\bpresign\s+not\s+implemented\b/i.test(raw);
  const hasCommitStub = /\bcommit\s+not\s+implemented\b/i.test(raw);

  if (hasPresignStub || hasCommitStub) {
    const bucket = STRICT ? errors : warnings;
    bucket.push({
      type: 'promise:upload-large',
      where: 'netlify/functions/api.js',
      msg: 'Ainda contém stub de presign/commit (upload grande quebraria no pitch).',
    });
  }
}

/* ============================================================================
  Runner
============================================================================ */

async function main() {
  const t0 = nowMs();
  const projectRoot = process.cwd();
  const distRootAbs = path.join(projectRoot, 'dist');

  // dist existe?
  if (!(await existsAbs(distRootAbs))) {
    console.error(`[smoke] Erro: pasta dist/ não encontrada em ${distRootAbs}`);
    process.exit(1);
  }

  const indexAbs = path.join(distRootAbs, 'index.html');
  const indexRaw = await readFileIfExists(indexAbs);
  if (!indexRaw) {
    console.error(`[smoke] Erro: dist/index.html não encontrado em ${indexAbs}`);
    process.exit(1);
  }

  const actionsJsAbs = path.join(projectRoot, 'src', 'actions.js');
  const actionsJs = await readFileIfExists(actionsJsAbs);
  if (!actionsJs) {
    console.error(`[smoke] Erro: src/actions.js não encontrado em ${actionsJsAbs}`);
    process.exit(1);
  }

  const apiJsAbs = path.join(projectRoot, 'src', 'services', 'api.js');
  const apiJs = await readFileIfExists(apiJsAbs);

  const mockDriverAbs = path.join(projectRoot, 'src', 'services', 'mockDriver.js');
  const mockDriverJs = await readFileIfExists(mockDriverAbs);

  const netlifyTomlAbs = path.join(projectRoot, 'netlify.toml');
  const netlifyToml = await readFileIfExists(netlifyTomlAbs);

  // Mapa rápido do conteúdo de dist/ (para checar existência sem fs.access repetido)
  const distAllAbs = await walkDirAbs(distRootAbs);
  const distFilesSet = new Set(distAllAbs.map((abs) => fileKeyFromAbs(distRootAbs, abs)));

  /** @type {Issue[]} */
  const errors = [];
  /** @type {Issue[]} */
  const warnings = [];

  // Coleta todos HTML do dist (inclui docs/)
  const distHtmlFiles = distAllAbs.filter((abs) => abs.toLowerCase().endsWith('.html'));

  // Check por HTML: IDs duplicados, aria-controls, assets (href/src/etc)
  for (const htmlAbs of distHtmlFiles) {
    const raw = await readFileIfExists(htmlAbs);
    if (!raw) continue;

    const html = stripHtmlComments(raw);
    const label = relPosix(distRootAbs, htmlAbs);

    checkDuplicateIdsInHtml(html, label, errors);
    checkAriaControlsInHtml(html, label, errors);
    checkHtmlAssetsExist(html, htmlAbs, distRootAbs, distFilesSet, errors);
  }

  // data-action -> handler (somente index)
  const indexHtml = stripHtmlComments(indexRaw);
  checkDataActions(indexHtml, actionsJs, errors);

  // api-driver mock coverage (se existirem)
  checkApiDriverMockCoverage(apiJs, mockDriverJs, errors);

  // manifest (se houver)
  await checkManifest(indexHtml, indexAbs, distRootAbs, distFilesSet, errors);

  // CSS: parseia apenas CSS referenciado por qualquer HTML (evita falso positivo de CSS não usado)
  const cssRefs = new Set();
  for (const htmlAbs of distHtmlFiles) {
    const raw = await readFileIfExists(htmlAbs);
    if (!raw) continue;

    const html = stripHtmlComments(raw);
    const baseDirAbs = path.dirname(htmlAbs);

    const hrefs = extractAttrValues(html, 'href');
    for (const h of hrefs) {
      if (shouldIgnoreUrl(h)) continue;

      const clean = normalizeUrl(h);
      if (!clean) continue;
      if (!looksLikeFilePath(clean)) continue;
      if (!/\.css$/i.test(clean)) continue;

      const cssAbs = resolveRefToAbs(distRootAbs, clean, baseDirAbs);
      if (!cssAbs) continue;

      const key = fileKeyFromAbs(distRootAbs, cssAbs);
      if (distFilesSet.has(key)) cssRefs.add(cssAbs);
    }
  }

  for (const cssAbs of cssRefs) {
    await checkCssAssetsExist(cssAbs, distRootAbs, distFilesSet, errors);
    await checkSourceMapForFile(cssAbs, distRootAbs, distFilesSet, errors);
  }

  // JS/CSS sourcemap para assets referenciados no index (rápido e útil)
  const indexAssetRefs = extractLocalAssetRefsFromHtml(indexHtml);
  for (const ref of indexAssetRefs) {
    if (!/\.(js|css)$/i.test(ref)) continue;

    const abs = resolveRefToAbs(distRootAbs, ref, distRootAbs);
    if (!abs) continue;

    const key = fileKeyFromAbs(distRootAbs, abs);
    if (!distFilesSet.has(key)) continue;

    await checkSourceMapForFile(abs, distRootAbs, distFilesSet, errors);
  }

  // Netlify redirects -> functions (e coleta info p/ docs check)
  const netlifyFnInfo = await checkNetlifyFunctions(netlifyToml, projectRoot, errors, warnings);

  // Documentação (NEW): garante que a base documentada permanece documentada
  await checkProjectDocumentation(projectRoot, netlifyFnInfo, errors, warnings);

  // Upload grande (presign/commit) — anti-regressão de promessa
  await checkLargeUploadStubs(projectRoot, errors, warnings);

  // Resultado final
  const dt = fmtMs(nowMs() - t0);

  if (warnings.length && !STRICT) {
    console.warn(`[smoke] Avisos (${warnings.length}) — não bloqueiam deploy (STRICT=1 bloqueia):`);
    for (const w of warnings) console.warn(` - [${w.type}] ${w.where}: ${w.msg}`);
  }

  if (errors.length) {
    console.error(`[smoke] Falhas detectadas (${errors.length}) — build/deploy BLOQUEADO:`);
    for (const e of errors) console.error(` - [${e.type}] ${e.where}: ${e.msg}`);
    console.error(`[smoke] Duração: ${dt}`);
    process.exit(1);
  }

  console.log(`[smoke] OK: ${distHtmlFiles.length} HTML, ${cssRefs.size} CSS verificados. Duração: ${dt}`);
}

main().catch((err) => {
  console.error('[smoke] Erro inesperado:', err);
  process.exit(1);
});
