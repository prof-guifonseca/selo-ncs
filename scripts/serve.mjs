#!/usr/bin/env node
/**
 * scripts/serve.mjs
 *
 * Servidor estático zero-deps para testar /dist via http://.
 * Isso é importante porque o navegador costuma bloquear ES Modules quando
 * você abre o dist/index.html via file://.
 *
 * Uso:
 *   npm run build
 *   npm run serve
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function send(res, status, body, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

async function fileExists(p) {
  try {
    const st = await stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = safeDecodeURIComponent(url.pathname);

    // Normaliza: sem query/hash
    let rel = pathname;
    if (rel.startsWith('/')) rel = rel.slice(1);

    // Default: index
    if (!rel) rel = 'index.html';

    const requestedPath = path.resolve(DIST_DIR, rel);

    // Proteção simples contra path traversal
    if (!requestedPath.startsWith(DIST_DIR)) {
      return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    }

    let targetPath = requestedPath;

    // Se pedir uma pasta, tenta index.html
    if (!(await fileExists(targetPath))) {
      const asDirIndex = path.join(requestedPath, 'index.html');
      if (await fileExists(asDirIndex)) {
        targetPath = asDirIndex;
      } else {
        // SPA fallback
        targetPath = path.join(DIST_DIR, 'index.html');
      }
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const body = await readFile(targetPath);

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch (e) {
    send(res, 500, 'Internal Server Error', 'text/plain; charset=utf-8');
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[serve] http://localhost:${PORT} (dir: ${DIST_DIR})`);
});
