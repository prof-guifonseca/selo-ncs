<!--
  DEPRECATED
  Este inventário de dependências externas refere-se ao programa anterior.
  Consulte `docs/ip/dossie/06_THIRD_PARTY_E_LICENCAS.md` para a versão atualizada para o Programa MES.
-->

# Third‑Party / Dependências externas (técnico)

**Data:** 2026-01-04  
Objetivo: inventariar dependências que impactam custo, risco e auditoria (supply chain).

## Plataformas/serviços

- **Netlify**: hosting estático + Functions
- **Supabase**: Postgres + Auth (via JWT) + Storage (signed URLs)
- **OpenAI API** (opcional): usado pela function `/.netlify/functions/chat` se `OPENAI_API_KEY` estiver configurada

## NPM (package.json)

### Dependências declaradas
- `openai`
- `@supabase/supabase-js`

### Observação relevante
No estado atual do código:
- o backend fala com OpenAI via `fetch` (sem importar a lib `openai`)
- o backend fala com Supabase via REST/Storage com `fetch` (sem importar `@supabase/supabase-js`)

**Recomendação objetiva:** se essas libs não forem realmente necessárias, removê‑las reduz:
- superfície de supply chain,
- tempo de instalação/build,
- ruído em auditoria de terceiros.

### Dev deps
- `typescript`, `eslint` (suporte a lint/typecheck)

## Bibliotecas nativas
O backend usa principalmente:
- `crypto` (Node)
- `URL`, `fetch` (runtime)

## Risco/custo
- IA (OpenAI) deve ser **feature flag** com limites e logs (evita custo variável/reputacional).
- Sem lockfile (`package-lock.json`) o build não é determinístico (impacta credibilidade).
