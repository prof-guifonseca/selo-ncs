# Escopo do Software a Ser Registrado

Este documento define explicitamente o escopo do software objeto do registro no INPI.  Delimitar o escopo é fundamental para evitar que ativos institucionais da NCS ou componentes metodológicos do arranjo sejam indevidamente incluídos no registro de código‑fonte.

## Inclusões (o que está coberto)

São objeto do registro apenas os arquivos e diretórios que compõem a **Plataforma**, conforme definido no quadro de delimitação.  Isso inclui:

- **Código‑fonte do front‑end:** diretório `src/` contendo scripts JavaScript (SPA), roteador, actions, serviços e dashboards, bem como `partials/` com trechos HTML e `styles/` com folhas de estilo CSS.
- **Código‑fonte do back‑end:** diretório `netlify/functions/` com funções serverless (`api`, `report`, `chat` e `telemetry*`) escritas em Node.js, além do roteador `netlify/functions/api/index.js` e arquivos de configuração como `netlify.toml`.
- **Scripts e utilitários:** `build.js` (compilador static‑first), scripts de release e smoke tests em `scripts/`, e os novos scripts de snapshot e hash (`ip_snapshot.mjs` e `ip_sha512.mjs`).
- **Documentação técnica relevante:** arquivos em `docs/` que descrevem arquitetura, API e operação do software, exceto aqueles marcados como deprecated.  Inclui também este dossiê e os checklists INPI.
- **Configurações de projeto:** `package.json`, `package-lock.json`, `tsconfig.json`, `index.html`, `ROUTE_MAP.md`, `README.md`, `LICENSE` e `NOTICE`.

## Exclusões (o que não está coberto)

Os seguintes itens **não** devem compor o snapshot nem integrar o objeto de registro de software:

- **Marca, nome e sinais distintivos da NCS/MES:** logos, selos, identidade visual, slogans e qualquer arte institucional (ver quadro de delimitação【689463090271669†L390-L404】).
- **Metodologia e documentos do arranjo:** fluxos, critérios, templates de evidências e relatórios, matrizes de pontuação, checklists e demais documentos que constituem o Arranjo do Programa (titularidade do Operador como obra literária e metodológica【689463090271669†L405-L435】).
- **Dados de usuários ou evidências:** bancos de dados, dumps, planilhas de resultados, bem como qualquer conteúdo carregado por participantes ou avaliadores.  A plataforma deve ser registrada sem dados pessoais.
- **Credenciais e segredos:** arquivos `.env`, chaves de API (OpenAI, Supabase), tokens de sessão, credenciais e configurações sensíveis.  Estes itens são confidenciais e nunca devem ser depositados.
- **Dependências transitivas:** a pasta `node_modules/` e qualquer diretório gerado automaticamente pelo build (`dist/`) ou pelo gerenciador de pacotes.  O snapshot se baseia apenas no código próprio.

## Observações

1. A delimitação não impede que a metodologia (Arranjo) ou a identidade visual sejam protegidas por outros meios (direito autoral, marca, contratos).  Aqui apenas se define o escopo do **registro de programa de computador**.
2. O escopo deve ser revisto a cada nova versão do software.  Caso novos módulos ou serviços sejam adicionados, atualize esta lista e o script de snapshot.