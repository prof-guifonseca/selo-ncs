# Dev local (prático)

## O que dá para fazer 100% local (sem Netlify CLI)

### 1) Build e preview do front
```bash
npm install
npm run build
```

Servir `/dist`:
```bash
python -m http.server 5173 --directory dist
```
Depois abra: `http://localhost:5173`

> Observação: o front espera falar com `/api`. Localmente, sem Netlify dev,
> você não terá Functions automaticamente em `/api`.

### 2) Smoke tests (o “gate barato”)
```bash
npm run smoke
node scripts/smoke_backend.mjs
```

## Integração com Functions (opcional)

Se você quiser testar end-to-end localmente, use Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

Isso expõe:
- site: `http://localhost:8888`
- api: `http://localhost:8888/.netlify/functions/api` (e redirects de `/api`)

## Como configurar o API base no front

O shell (`index.html`) define o API base por:
- `meta[name="ncs-api-base"]`, ou
- `body[data-api-base]`, ou
- `"/api"` (default)

Em ambientes não-Netlify, configure explicitamente via meta/body.
