<!--
  DEPRECATED
  Este dossiê refere-se ao programa anterior “NCS: Governança & Impacto” e não deve ser utilizado para o registro do Programa MES (Meu Empreendimento Sustentável).
  Um novo IP PACK completo encontra-se em `docs/ip/dossie/` e `docs/ip/inpi/`, com quadro de delimitação, inventário atualizado e scripts de snapshot.
-->

# IP Dossier — NCS “Selo Governança & Impacto” (mínimo defensável)

## 0) Finalidade

Este dossiê organiza informações mínimas para:
- diligência técnica/jurídica (PI hygiene),
- preparação para registro de software e proteção de ativos,
- padronização interna de titularidade, marcas e materiais de terceiros.

## 1) O que é o software

**Nome do produto (plataforma):** NCS — Selo Governança & Impacto (plataforma de operação do Programa).

**Arquitetura (alto nível):**
- Frontend **SPA static‑first** (Vanilla JS ES Modules), com roteamento próprio e ações por `data-action`.
- Build simples que monta HTML por `partials/` → `dist/` (`build.js`).
- Backend em **Netlify Functions** (`netlify/functions/*`) expondo `/api/*`.
- Integração prevista/ativa com **Supabase** (Auth + PostgREST + Storage), com chamadas server‑side via
  Functions (o browser não deve falar direto com Supabase).

## 2) Módulos principais (mapeamento do repo)

### 2.1 Frontend (src/)

- `src/main.js` — bootstrap e wiring do app.
- `src/router.js` — roteamento SPA.
- `src/actions.js` — roteador central de ações (`data-action`).
- `src/auth.js` — autenticação (login/register) e sessão em memória.
- `src/chat.js` — UI do chat (feature flag + fallback FAQ local).
- `src/dashboards/*` — dashboards por papel (client/auditor/admin) + shared.
- `src/services/*` — drivers de API (contrato `/api/*`).
- `src/report.js`, `src/deliverables.js` — geração de entregáveis.
- `src/legal.js` — render/links para termos e políticas.

### 2.2 Backend (Netlify Functions)

- `netlify/functions/api.js` — router de API `/api/*` (contratos do remoteDriver).
- `netlify/functions/chat.js` — endpoint de chat IA (opt‑in via meta flag).
- `netlify/functions/report.js` — geração/entrega de relatórios.  Este handler agora implementa um relatório mínimo profissional: retorna JSON com o processo, evidências e KPIs ou um HTML auto‑contido pronto para impressão, conforme o header `Accept`.  A rota está protegida por cookie HttpOnly e restrita aos papéis `admin` e `auditor`.
 - `netlify/functions/telemetry*.js` — telemetria (coleta eventos e responde com ACK, sem persistir dados neste snapshot).

### 2.3 Documentos do Programa (docs/)

O repo contém documentos operacionais do Programa (regulamentos, termos, políticas) publicados em `docs/`
como HTML/MD, para dar lastro institucional e rastreabilidade.

### 2.4 Scripts auxiliares

- `scripts/release.mjs` — script de automação de release.  Verifica o estado do working tree, executa `npm run ci` e `npm run docs:check`, garante que o changelog está atualizado e sugere a próxima tag seguindo semver.  Deve ser executado antes de criar uma release ou promover mudanças para produção.

## 3) Titularidade e relação com a marca NCS (sem cessão)

### 3.1 Titularidade do software e do “arranjo do programa”

O **OPERADOR/LICENCIANTE** é o titular exclusivo do:
- **Arranjo do Programa** (metodologia, fluxos, rubricas, critérios, templates e entregáveis), e
- **Plataforma** (software, código‑fonte, arquitetura, componentes e rotinas).

### 3.2 Ativos institucionais da NCS (terceiro)

A **NCS** é titular exclusiva de seus **ativos institucionais**, incluindo:
- marca e sinais distintivos “NCS”,
- nome do Programa “NCS: Governança & Impacto”,
- identidade visual, selos, símbolos e comunicações institucionais.

### 3.3 Licenças contratuais (uso no Programa)

Existe contrato específico (“Contrato de Licenciamento de Solução e Parceria Operacional — 30/12/2025”) que:
- licencia ao NCS o uso do Arranjo do Programa e da Plataforma estritamente para executar o Programa; e
- licencia ao OPERADOR o uso operacional dos sinais distintivos da NCS para operar o Programa e a Plataforma.

Este repo NÃO deve, em hipótese alguma, sugerir cessão/transferência da marca NCS.

## 4) Materiais de terceiros (inventário)

- Inventário de dependências e assets: `docs/ip/THIRD_PARTY.md`.
- Ponto de atenção recorrente: logos e marcas (NCS e UEL/INTUEL/AINTEC) precisam estar **expressamente
  identificados como de terceiros**, com lastro/anuência arquivados quando aplicável.

## 5) Evidências para PI/registro (checklist operacional)

### 5.1 Evidências técnicas (mínimo)

- [ ] Tag de versão do protótipo (ex.: `vX.Y.Z`) e changelog associado.
- [ ] Export do histórico do repositório (logs) ou prova de autoria (commits/assinaturas).
- [ ] Pacote de arquitetura (`docs/architecture/*`) fechado e versionado.
- [ ] Smoke test rodando em CI (ou script documentado) para reduzir regressões.
- [ ] Inventário de dependências (SBOM leve) em `docs/ip/_deps/`.

### 5.2 Evidências funcionais (mínimo)

- [ ] Capturas (prints) de fluxos críticos: login, dashboard client, dashboard auditor, emissão de entregáveis.
- [ ] Captura do contrato de API `/api/*` em execução (ex.: Postman/insomnia) e rota de health.

### 5.3 Evidências jurídicas (mínimo)

- [ ] Contrato NCS↔Operador assinado arquivado (fora do repo se contiver dados sensíveis).
- [ ] Dossiê de permissões/anuências de marcas UEL/INTUEL/AINTEC (quando aplicável).
- [ ] Registro de uso de marca NCS no escopo do contrato (material institucional/operacional).

## 6) Pontos de atenção (risk list curta)

- Lockfile/SBOM: sem lockfile, a reprodutibilidade do inventário de transitivas é frágil.
- Marcas/terceiros: manter inventário e evidências sempre atualizados.
- Publicação acidental: manter `private: true` no `package.json` e restringir acessos.
