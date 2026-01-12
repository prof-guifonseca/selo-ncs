#!/usr/bin/env node
/**
 * scripts/no-missing-docs.mjs
 *
 * Falha se faltar documentação/arquivos críticos (reprodutibilidade/investidor).
 * Sem dependências.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const REQUIRED = [
  'LICENSE',
  'NOTICE',
  'COPYRIGHT.md',

  'docs/ip/IP_DOSSIER.md',
  'docs/ip/THIRD_PARTY.md',

  'docs/dev/DEPLOY_CHECKLIST.md',

  'docs/CHANGELOG.md',
  'docs/dev/observability.sql',
  // Handbook de front-end para onboarding rápido
  'docs/front/FRONTEND_HANDBOOK.md',
];

function exists(p) {
  try {
    fs.accessSync(path.join(ROOT, p), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const missing = REQUIRED.filter((p) => !exists(p));

if (missing.length) {
  console.error('[docs-check] Missing required files:');
  for (const p of missing) console.error(' -', p);
  process.exit(1);
}

console.log('[docs-check] OK');
