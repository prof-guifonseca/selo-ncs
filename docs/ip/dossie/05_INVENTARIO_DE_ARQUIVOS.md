# Inventário de Arquivos – Snapshot do Commit f3ae298…

Este inventário resume os diretórios e arquivos mais relevantes incluídos no snapshot gerado para o registro de software.  O inventário visa comprovar a existência das peças no momento do registro e orientar futuras auditorias.  Arquivos temporários, dados e dependências de terceiros foram excluídos do snapshot.

## Diretórios principais

| Diretório | Descrição | Observações |
| --- | --- | --- |
| `src/` | Código‑fonte do front‑end (SPA). Contém `main.js`, `router.js`, `actions.js`, `auth.js`, módulos de dashboards (`dashboards/`), drivers de API (`services/`), geradores de relatórios (`report.js`, `deliverables.js`) e utilitários. | Elemento central da Plataforma. |
| `partials/` | Fragmentos HTML reutilizados pelo build (`header.html`, `footer.html`, dashboards parciais). | Incluídos integralmente. |
| `styles/` | Folhas de estilo CSS que definem a aparência da aplicação. | Não incluem logos nem imagens de terceiros. |
| `netlify/functions/` | Back‑end serverless. Subdiretórios `api/`, `telemetry*`, e funções dedicadas (`report.js`, `chat.js`). | Incluem roteadores, handlers e integração com Supabase e OpenAI. |
| `scripts/` | Scripts de build, release, smoke tests e os novos utilitários `ip_snapshot.mjs` e `ip_sha512.mjs`. | Ferramentas auxiliares; não executam lógica de negócio. |
| `docs/` | Documentação técnica. Contém diagramas de arquitetura, API, manual de operação, dossiê de IP e checklists INPI. | Apenas os arquivos relevantes foram incluídos; documentos marcados como deprecated são mantidos para referência. |

## Arquivos de configuração

- `build.js` – script de compilação static‑first.
- `package.json` e `package-lock.json` – definem informações do projeto e garantem reprodução de dependências (mesmo que estejam vazias no snapshot atual).
- `netlify.toml` – configuração do roteamento e build no Netlify.
- `tsconfig.json` – configuração do TypeScript, usada apenas para desenvolvimento (o código é plain JS).
- `LICENSE`, `NOTICE` e `COPYRIGHT.md` – informações legais e de titularidade.
- `README.md` e outros documentos de nível raiz que explicam o projeto.

## Itens excluídos

- `node_modules/` – dependências de terceiros gerenciadas pelo npm (não fazem parte do código fonte).  O snapshot é reproduzido a partir do lockfile.
- `dist/` – artefatos gerados pelo build.  São reproduzíveis e não precisam ser registrados.
- Arquivos ocultos (`.git/`, `.env`) e quaisquer segredos ou dados sensíveis.
- Imagens institucionais de terceiros (logos da NCS e parceiros) que compõem a identidade visual, conforme definido no quadro de delimitação.

> Este inventário não substitui um SBOM completo, mas serve como referência para o registro de programa de computador.  Para auditorias de supply chain, consulte `06_THIRD_PARTY_E_LICENCAS.md`.