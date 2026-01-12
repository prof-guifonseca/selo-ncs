# JSDoc — auditoria rápida

Estado: **OK** (todos os módulos JS do repositório possuem cabeçalho JSDoc com `@fileoverview` e `@module`).

## O que foi padronizado

- cabeçalho JSDoc no topo de cada arquivo JS relevante
- descrições curtas e objetivas (propósito do módulo)

## Regra para novos arquivos

Todo arquivo novo em `src/`, `netlify/functions/` e `scripts/` deve começar com:

```js
/**
 * @fileoverview ...
 * @module ...
 */
```

Se o arquivo exporta funções públicas, inclua também JSDoc em:
- funções exportadas
- typedefs relevantes
