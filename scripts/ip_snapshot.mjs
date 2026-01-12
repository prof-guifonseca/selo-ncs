#!/usr/bin/env node
/**
 * scripts/ip_snapshot.mjs
 *
 * Gera um snapshot reprodutível do repositório para fins de registro de programa de computador.
 * O snapshot é um arquivo TAR normalizado (ordenação lexical, carimbo de data zerado, UID/GID zerados) e
 * exclui arquivos e pastas que não fazem parte do código fonte (node_modules, dist, .git, arquivos de ambiente, etc.).
 *
 * Uso:
 *   node scripts/ip_snapshot.mjs
 *
 * O arquivo gerado é salvo em `docs/ip/inpi/snapshot.tar`.
 */

import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'docs', 'ip', 'inpi');
const snapshotName = 'snapshot.tar';
const snapshotPath = path.join(outDir, snapshotName);

async function ensureOutDir() {
  await fs.mkdir(outDir, { recursive: true });
}

async function createSnapshot() {
  // Remove snapshot anterior, se existir
  try {
    await fs.unlink(snapshotPath);
  } catch {
    // ignore
  }
  // Construir argumentos para o tar.  O uso de --sort=name, --owner=0, --group=0 e --mtime=@0
  // garante reprodutibilidade ao arquivo gerado.  Os padrões de exclusão evitam incluir
  // dependências, artefatos de build, repositório Git e dados sensíveis.
  const tarArgs = [
    '--sort=name',
    '--owner=0',
    '--group=0',
    '--mtime=@0',
    '--exclude=node_modules',
    '--exclude=dist',
    '--exclude=.git',
    '--exclude=.env',
    '--exclude=.env.*',
    '--exclude=*.log',
    '--exclude=docs/ip/inpi/snapshot.tar',
    '-cf',
    snapshotPath,
    '.',
  ];
  await new Promise((resolve, reject) => {
    execFile('tar', tarArgs, { cwd: rootDir }, (error, stdout, stderr) => {
      if (error) {
        console.error(stderr);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  await ensureOutDir();
  await createSnapshot();
  console.log(`[ip_snapshot] Snapshot criado em ${snapshotPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});