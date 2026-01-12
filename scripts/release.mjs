#!/usr/bin/env node
/**
 * scripts/release.mjs
 *
 * Script de apoio para releases.  Executa verificações básicas,
 * garante que a árvore de trabalho está limpa (quando possível),
 * roda a pipeline de CI (`npm run ci`), valida a presença de
 * entradas recentes no changelog e sugere a próxima tag
 * semântica (incremento de patch).  Não cria tags nem publica.
 */

import { execSync } from 'child_process';
import fs from 'fs';

/** Execute um comando e repasse stdio.  Em caso de erro, lança. */
function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

/** Tente executar um comando.  Retorna true em sucesso, false em erro. */
function maybeRun(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

(() => {
  // Verificar estado da árvore de trabalho via git.  Falha silenciosa quando git não existe.
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.warn('[release] Árvore de trabalho contém alterações não commitadas.');
    }
  } catch {
    console.warn('[release] Git indisponível; pulando verificação de árvore de trabalho.');
  }

  // Executar pipeline de CI
  console.log('[release] Executando CI (npm run ci)...');
  if (!maybeRun('npm run ci')) {
    console.error('[release] CI falhou.  Abortando.');
    process.exit(1);
  }

  // Executar docs:check se definido
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch {
    pkg = {};
  }
  if (pkg.scripts && pkg.scripts['docs:check']) {
    console.log('[release] Executando docs:check...');
    if (!maybeRun('npm run docs:check')) {
      console.error('[release] docs:check falhou.  Abortando.');
      process.exit(1);
    }
  }

  // Validar que CHANGELOG contém data de hoje ou seção Unreleased
  const changelogPath = 'docs/CHANGELOG.md';
  const today = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(changelogPath)) {
    const content = fs.readFileSync(changelogPath, 'utf8');
    if (!content.includes(today) && !/##\s+\[Unreleased\]/i.test(content)) {
      console.warn(`[release] docs/CHANGELOG.md não contém entrada com a data ${today} nem seção Unreleased.`);
    }
  } else {
    console.warn('[release] docs/CHANGELOG.md não encontrado.');
  }

  // Sugerir próxima tag com incremento de patch
  let nextTag = null;
  try {
    const ver = String(pkg.version || '').trim();
    const parts = ver.split('.').map((n) => parseInt(n, 10));
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      parts[2] += 1;
      nextTag = 'v' + parts.join('.');
    }
  } catch {}
  if (nextTag) {
    console.log(`[release] Sugestão de próxima tag: ${nextTag}`);
  } else {
    console.log('[release] Não foi possível sugerir próxima tag.');
  }
})();