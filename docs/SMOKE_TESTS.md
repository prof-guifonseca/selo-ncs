# Smoke tests (front + backend)

O repo já possui dois smoke scripts complementares. Eles são a defesa mais barata contra regressões.

## 1) Smoke do front/build

### Rodar
```bash
npm run build
npm run smoke
```

### O que valida (na prática)
- `/dist` foi gerado
- partials foram incluídos no shell
- assets/copias essenciais estão presentes
- inconsistências “óbvias” (duplicação, referências quebradas)

Arquivo: `scripts/smoke.mjs`

## 2) Smoke do backend (gates + segurança)

### Rodar
```bash
node scripts/smoke_backend.mjs
```

### O que valida (na prática)
- Fail‑closed quando env crítica está faltando (`503`)
- Fail‑closed quando auth é exigida (`401`)
- Comportamento básico do router e contratos mínimos
- Executa o handler em memória (não exige Netlify CLI)

Arquivo: `scripts/smoke_backend.mjs`

## Recomendação de CI (gates oficiais)

Para simplificar a execução dos checks e smoke tests, utilize os comandos agrupados definidos no `package.json`.  Eles consolidam várias verificações em uma única chamada:

- **`npm run ci`** – agrupa checagem de documentação, build, typecheck, smoke tests (front e backend) e suítes de contrato.  Este é o gate oficial para bloquear regressões no CI.
- **`npm run e2e`** – executa os testes end‑to‑end automatizados com Playwright.

Se preferir executar etapas isoladas, os scripts individuais continuam disponíveis (por exemplo, `npm run smoke` ou `node scripts/smoke_backend.mjs`).

> Para builds determinísticos, commite o arquivo `package‑lock.json` e utilize `npm ci` antes de rodar `npm run ci`.
