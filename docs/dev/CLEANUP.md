# Limpeza recomendada (reduzir ruído antes de “vender”)

## Arquivos com alta probabilidade de legado / não usados

> Confirme com `git grep` antes de remover; removals devem vir com smoke test.

### 1) Scripts no root
<!-- Nota: o sistema de tours foi descontinuado e `src/tour.js` foi removido. Não há `tour.js` sobrando. -->

### 2) Módulos aparentemente órfãos
- `src/legal.js` — não há imports/referências na rota atual (avaliar se ainda faz sentido).
- `src/evidenceStore.js` — não há imports/referências; se o projeto está em direção server-first, pode ser removido ou movido para `archive/`.

## Documentação antiga

Se existir documentação que contradiz os novos docs em `docs/architecture/*` e `docs/dev/*`, a recomendação é:
- substituir por “stubs de redirecionamento” (como em `docs/architecture/SCALING_ROADMAP.md`), ou
- remover se não for mais referenciada.

## Estratégia segura de remoção

1) remover um arquivo por commit
2) rodar `npm run check`
3) garantir que `dist/` sobe e que navegação básica funciona
