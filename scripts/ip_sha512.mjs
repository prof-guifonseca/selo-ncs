#!/usr/bin/env node
/**
 * scripts/ip_sha512.mjs
 *
 * Calcula o hash SHA‑512 do snapshot gerado por `ip_snapshot.mjs` e atualiza os documentos
 * `docs/ip/inpi/03_RESUMO_DIGITAL_SHA512.md` e `docs/ip/dossie/08_REGISTRO_DE_MUDANCAS_E_HASH.md`.
 *
 * Uso:
 *   node scripts/ip_sha512.mjs
 */

import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const snapshotPath = path.join(rootDir, 'docs', 'ip', 'inpi', 'snapshot.tar');
const resumoDigitalPath = path.join(rootDir, 'docs', 'ip', 'inpi', '03_RESUMO_DIGITAL_SHA512.md');
const registroPath = path.join(rootDir, 'docs', 'ip', 'dossie', '08_REGISTRO_DE_MUDANCAS_E_HASH.md');

async function computeHash(filePath) {
  const buffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha512').update(buffer).digest('hex');
  return hash;
}

async function replacePlaceholder(filePath, placeholder, value) {
  let content = await fs.readFile(filePath, 'utf8');
  if (!content.includes(placeholder)) {
    console.warn(`[ip_sha512] Aviso: placeholder "${placeholder}" não encontrado em ${filePath}`);
    return;
  }
  const updated = content.replace(placeholder, value);
  await fs.writeFile(filePath, updated, 'utf8');
}

async function main() {
  // Verificar se o snapshot existe
  try {
    await fs.stat(snapshotPath);
  } catch {
    throw new Error(`Snapshot não encontrado em ${snapshotPath}. Execute ip_snapshot.mjs primeiro.`);
  }
  const hash = await computeHash(snapshotPath);
  // Atualiza o resumo digital
  await replacePlaceholder(resumoDigitalPath, '<pendente de cálculo>', hash);
  // Atualiza a primeira ocorrência na tabela de registro de mudanças
  await replacePlaceholder(registroPath, '<pendente de cálculo>', hash);
  console.log(`[ip_sha512] SHA‑512 do snapshot: ${hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});