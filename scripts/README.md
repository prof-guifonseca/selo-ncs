# Scripts do Selo NCS

Este diretório contém utilitários e gates usados durante o desenvolvimento, integração contínua (CI), publicação e provas de integridade do Selo NCS.  Para facilitar a navegação, os scripts existentes são resumidos na tabela a seguir, categorizados conforme sua finalidade.

| Script | Categoria | Como executar | Quando usar |
|-------|----------|---------------|------------|
| **contract_backend.mjs** | CI Gate | `npm run contract` ou `node scripts/contract_backend.mjs` | Executa testes de contrato para o backend (rotas, parâmetros e autenticação) como parte do CI |
| **contract_front.mjs** | CI Gate | `npm run contract:front` ou `node scripts/contract_front.mjs` | Valida a consistência do front‑end após o build, garantindo que views, ações e modais existam |
| **health_check.mjs** | Probe | `node scripts/health_check.mjs` (defina `HEALTH_BASE` se necessário) | Verifica manualmente a saúde do endpoint `/health` retornando status e tempo de resposta |
| **ip_sha512.mjs** | IP | `node scripts/ip_sha512.mjs` | Calcula o hash SHA‑512 do snapshot IP e atualiza os documentos de registro de propriedade intelectual |
| **ip_snapshot.mjs** | IP | `node scripts/ip_snapshot.mjs` | Gera um snapshot reprodutível do repositório para fins de propriedade intelectual |
| **no-missing-docs.mjs** | CI Gate | `npm run check:docs` ou `node scripts/no-missing-docs.mjs` | Garante que arquivos e documentos críticos existam antes do build/CI |
| **register_probe.mjs** | Probe | `node scripts/register_probe.mjs` com as variáveis `PROBE_API_BASE` e `PROBE_COMPANY_NAME` | Testa o endpoint de auto‑cadastro, verificando sucesso com payload válido e falha quando os termos não são aceitos |
| **release.mjs** | Release | `node scripts/release.mjs` | Roda o pipeline de CI e valida pré‑requisitos de release, sugerindo a próxima tag semântica |
| **rls_probe.mjs** | Probe | `node scripts/rls_probe.mjs` com `PROBE_API_BASE` e tokens de usuários | Prova manualmente o isolamento multi‑tenant, testando acessos permitidos e negados entre dois tenants |
| **serve.mjs** | Probe | `npm run serve` ou `node scripts/serve.mjs` | Sobe um servidor estático simples para testar a pasta `dist/` via HTTP localmente |
| **smoke.mjs** | CI Gate | `npm run smoke` ou `node scripts/smoke.mjs` | Smoke test do front; verifica que o build contém assets e estrutura mínima sem dependências externas |
| **smoke_backend.mjs** | CI Gate | `npm run smoke:backend` ou `node scripts/smoke_backend.mjs` | Smoke test do backend; exercita o handler em memória e valida gates básicos de RLS e autenticação |
| **typecheck-front-entry.js** | CI Gate | `npm run typecheck:front` | Entrypoint para o TypeScript analisar módulos críticos do front‑end |
| **typecheck-node-entry.js** | CI Gate | `npm run typecheck:node` | Entrypoint para o TypeScript verificar módulos selecionados do backend |
| **typecheck-stub.js** | CI Gate | Usado internamente pelo `npm run typecheck` | Stub vazio que permite rodar o typecheck sem definir globals de Node/browser |

## Categorias

- **CI Gate** – scripts executados automaticamente no pipeline de integração contínua para bloquear regressões.  Eles verificam contratos de API e UI, validam documentação, compilam tipos e rodam smoke tests.
- **Probe** – utilitários manuais que ajudam a comprovar comportamentos em ambientes remotos, como checar a saúde da API, validar o fluxo de registro ou provar o isolamento multi‑tenant.
- **Release** – scripts que auxiliam no processo de empacotar e publicar uma nova versão, agregando verificações e sugerindo versionamento sem criar artefatos por conta própria.
- **IP** – scripts relacionados ao registro de propriedade intelectual.  Geram snapshots reprodutíveis do repositório e calculam hashes para atualização de documentos oficiais.

Utilize os comandos do `npm` sempre que disponíveis (por exemplo, `npm run ci` e `npm run e2e`) para acionar múltiplos scripts de uma só vez de forma consistente.