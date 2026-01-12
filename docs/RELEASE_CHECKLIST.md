# Checklist de Release (DoD 31–90)

Este documento descreve um checklist objetivo para preparar, construir e publicar um release do Selo NCS.  Ele complementa o plano de release geral e serve como referência rápida para quem faz manutenção do repositório.

## 1. Preparação

1. **Sincronizar escopo e versionamento**
   - Verifique que todas as tarefas planejadas para o ciclo atual estão concluídas ou explicitamente adiadas.
   - Atualize `package.json` com a nova versão SemVer (e.g. `1.2.0`).  A versão deve ser refletida em `docs/CHANGELOG.md` e nos assets gerados.

2. **Atualizar documentação**
   - Edite `docs/CHANGELOG.md` para incluir uma entrada com as mudanças do release.
   - Revise `docs/ENV.md`, `docs/STATUS.md` e demais páginas para garantir que refletem o código atual.
   - Se novas variáveis de ambiente foram introduzidas (como `NCS_AI_ENABLED`), adicione descrições e valores padrão.

3. **Configurar ambiente local**
   - Ajuste ou crie um `.env` local baseado em `.env.example` para testar os gates/flags desejados (`NCS_REQUIRE_AUTH`, `NCS_AI_ENABLED`).  `NCS_USE_RLS` deve permanecer `1` (ou omitido), pois o backend é RLS-only.
   - Limpe caches e remova arquivos residuais (`rm -rf dist` se existir).

## 2. Build e Validações Locais

1. **Gerar artefato estático**
   - Execute o build com: `node build.js`.  Este comando gera a pasta `dist/` a partir de `index.html`, `partials/`, `styles/`, `images/` e `src/`.
   - Confirme que `dist/index.html` contém uma meta `ncs-build-version` e que referências a CSS/JS incluem `?v=<versão>`.

2. **Smoke tests do front**
   - Rode `node scripts/smoke.mjs`.  O script valida a existência de assets, `aria-*` mínimos e duplicação de IDs.  Qualquer erro faz o release ser bloqueado.

3. **Smoke tests do backend**
   - Rode `node scripts/smoke_backend.mjs` com as variáveis de ambiente desejadas (por exemplo, `NCS_USE_RLS=1` e chaves Supabase dummy).  Confirme que rotas sensíveis retornam os códigos esperados (401/503) e que o endpoint `/health` responde 200.

4. **Testes de contrato**
   - Execute `node scripts/contract_backend.mjs`.  A suíte de contrato cobre parâmetros obrigatórios e valida gateways de autorização.  Em ambiente CI o script roda automaticamente via `npm run ci`.
   - Para habilitar testes que dependem de Supabase real, defina `CONTRACT_BACKEND_LIVE=1` e exporte as chaves necessárias (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).

## 3. Prova de Multi‑Tenant (Staging)

Esta etapa é **manual** e deve ser realizada em um ambiente de staging configurado com RLS habilitado.

Referências:
- Runbook: `docs/STAGING_RLS_PROOF.md`
- Pacote de evidências: `docs/evidencias/` (arquivos DoD)

### 3.1 Preparar ambientes e dados
- Crie dois usuários/tenants distintos (Tenant A e Tenant B).
- Garanta que cada tenant tenha **ao menos um processo**.
- Registre os **inputs não sensíveis** em `docs/evidencias/PROBE_INPUTS.md`.

### 3.2 Executar o probe
- Preferencial: `node scripts/rls_probe.mjs` (Bearer) — siga `docs/evidencias/PROBE_SETUP.md`.
- Fallback: modo cookie jar — siga `docs/evidencias/PROBE_MANUAL_CURL.md`.

> Ao final, cole o output em `docs/evidencias/RLS_PROBE_RESULT.txt` (sem tokens).

### 3.3 Checklist e E2E
- Preencha `docs/evidencias/SECURITY_STAGING_CHECKLIST.md`.
- Execute e registre um E2E manual em `docs/evidencias/E2E_STAGING_RUN.txt`.

## 4. Release Candidate e Publicação

1. **Executar CI**
   - Execute `npm run ci`.  O comando realiza o build, roda os smoke tests, o typecheck e as suítes de contrato.  Todos devem passar para prosseguir.
   - Opcionalmente, execute também `npm run e2e` para rodar os testes end‑to‑end automatizados (Playwright) e capturar regressões de ponta a ponta.

2. **Gerar tag e publicar**
   - Após validar localmente e em staging, crie uma tag Git (`vX.Y.Z`) correspondente à versão.  Envie para o repositório remoto.
   - Faça o deploy no provedor (Netlify) apontando para a tag do release.  Configure variáveis de ambiente conforme `docs/ENV.md` (especialmente `NCS_USE_RLS`, `NCS_REQUIRE_AUTH` e `NCS_AI_ENABLED`).

3. **Smoke pós‑deploy**
   - Acesse a aplicação em produção e valide rotas básicas (`/`, login, upload de evidências, `/api/health`).  Use contas reais ou de teste para confirmar a ausência de regressões.

4. **Monitoramento inicial**
   - Nas primeiras 24 horas acompanhe logs do Netlify e da Supabase em busca de erros 5xx, falhas de autenticação e lentidão.  Ajuste variáveis de ambiente se necessário.

## 5. Pós‑release

1. **Documentar lições aprendidas**
   - Registre no backlog interno (veja `docs/DIAGNOSTIC.md` ou issues do repositório) problemas encontrados e melhorias desejadas.

2. **Planejar próximo ciclo**
   - Alinhe equipe sobre novas features, deprecações e tarefas de robustez para o próximo horizonte (H1/H2).

---

Siga este checklist para garantir releases reprodutíveis, confiáveis e fáceis de auditar.  Qualquer falha detectada em uma etapa deve bloquear a publicação até ser corrigida, preservando a integridade do selo.