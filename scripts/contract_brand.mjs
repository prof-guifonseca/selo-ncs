#!/usr/bin/env node
// @ts-check
/*
 * scripts/contract_brand.mjs
 *
 * Gate automático para validar pastas de marcas (white‑label).
 *
 * Este script inspeciona a pasta `/brands` e verifica que cada diretório de
 * marca contém um `config.json` e um `brand.css`.  Também valida que a
 * configuração define um nome completo para o programa (`program_name_full` ou
 * `program.name_full`) e um nome curto para a operação/plataforma
 * (`operator_name_short` ou `operator.name_short`).  A ausência de qualquer
 * item é considerada erro e interrompe o pipeline de CI com uma mensagem
 * explicativa.  Não utiliza dependências externas; apenas Node.js padrão.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

async function main() {
  const root = process.cwd();
  const brandsDir = path.join(root, 'brands');
  /** @type {Array<string>} */
  const errors = [];
  let dirEntries;
  try {
    dirEntries = await fs.readdir(brandsDir, { withFileTypes: true });
  } catch (err) {
    console.error('[contract:brand] Erro: pasta "brands" não encontrada.');
    process.exit(1);
  }
  // Filtra apenas subdiretórios (marcas)
  let brandDirs = dirEntries.filter((d) => d.isDirectory()).map((d) => d.name);
  // Ignora pasta 'default' legada caso exista; a marca padrão agora é 'cs'
  brandDirs = brandDirs.filter((name) => name !== 'default');
  for (const brandName of brandDirs) {
    const brandPath = path.join(brandsDir, brandName);
    const configPath = path.join(brandPath, 'config.json');
    const cssPath = path.join(brandPath, 'brand.css');
    if (!existsSync(configPath)) {
      errors.push(`[contract:brand] Erro: Marca "${brandName}" está sem config.json.`);
      // Não tenta ler a config se o arquivo não existir
    } else {
      // tenta ler e validar config
      try {
        const content = await fs.readFile(configPath, 'utf8');
        const json = JSON.parse(content);
        // programa: nome completo
        const hasProgramNameFull = Boolean(
          (json.program_name_full && String(json.program_name_full).trim() !== '') ||
            (json.program && json.program.name_full && String(json.program.name_full).trim() !== '')
        );
        if (!hasProgramNameFull) {
          errors.push(
            `[contract:brand] Erro: Marca "${brandName}" não define program.name_full (chave program_name_full ou program.name_full).`
          );
        }
        // operação: nome curto
        const hasOperatorShort = Boolean(
          (json.operator_name_short && String(json.operator_name_short).trim() !== '') ||
            (json.operator && json.operator.name_short && String(json.operator.name_short).trim() !== '')
        );
        if (!hasOperatorShort) {
          errors.push(
            `[contract:brand] Erro: Marca "${brandName}" não define operator.name_short (chave operator_name_short ou operator.name_short).`
          );
        }
      } catch (err) {
        errors.push(`[contract:brand] Erro: Falha ao ler config.json da marca "${brandName}": ${err.message || err}`);
      }
    }
    if (!existsSync(cssPath)) {
      errors.push(`[contract:brand] Erro: Marca "${brandName}" está sem brand.css.`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  } else {
    console.log(`[contract:brand] OK — ${brandDirs.length} marca(s) verificadas.`);
  }
}

main().catch((err) => {
  console.error('[contract:brand] Erro inesperado:', err);
  process.exit(1);
});