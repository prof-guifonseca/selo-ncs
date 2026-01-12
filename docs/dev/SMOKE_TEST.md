# Smoke test (anti-regressão)

Script: `scripts/smoke.mjs`  
Comando: `npm run smoke`

## O que ele deve garantir

- build gera `dist/` e não falha
- includes de `partials/` resolvem
- arquivos essenciais existem em `dist/`
- caminhos de módulos não foram quebrados por refactors
- rotas básicas do `/api/*` respondem em ambiente local (quando `netlify dev` está ativo), se aplicável

## Quando rodar

- antes de commit de refactor
- antes de criar tag/release
- sempre que mexer em `router.js`, `actions.js`, `main.js`, `services/*`, `build.js` ou `partials/`

## Como ampliar (sem deps)

Ao adicionar novos pontos críticos, prefira checks simples:
- ler `dist/index.html` e validar presença de IDs obrigatórios
- validar que `src/` não contém imports para arquivos removidos
- bater em 1–2 endpoints com `fetch` (se o backend estiver ativo)
