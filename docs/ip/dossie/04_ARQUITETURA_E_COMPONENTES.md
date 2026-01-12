# Arquitetura e Componentes

Esta seção descreve, em alto nível, a arquitetura da Plataforma Operacional do Programa MES e os componentes que a compõem.  O objetivo é fornecer contexto suficiente para entendimento da obra sem expor detalhes sensíveis do código.

## Visão geral

O sistema adota uma abordagem **static‑first**: o front‑end é pré‑processado para gerar arquivos estáticos que são servidos diretamente pelo CDN, enquanto o back‑end é implementado como funções serverless invocadas sob demanda.  Essa combinação reduz custos de hospedagem e melhora a experiência do usuário.

## Front‑end

- **Linguagem:** JavaScript (ES Modules) sem frameworks pesados; a aplicação é uma **Single Page Application (SPA)**.
- **Estrutura:** o ponto de entrada é `index.html`, que injeta parcial templates HTML de `partials/` e carrega `src/main.js` para inicializar o app.  O roteamento é gerenciado por `src/router.js`, que utiliza a History API (pathname + search) para determinar a view e atualizar a interface.  Fragmentos legados com `#` continuam funcionais: o inicializador converte fragmentos conhecidos (ex.: `/#login`) para as rotas equivalentes sem `#`.
- **Componentes principais:**
  - `src/actions.js` coordena ações disparadas por elementos DOM (`data-action`).
  - `src/auth.js` cuida de login, registro e sessão.
  - `src/dashboards/` contém dashboards específicos para participantes, avaliadores e administradores.
  - `src/services/` implementa drivers HTTP para acessar a API de backend.
  - `src/report.js` e `src/deliverables.js` geram relatórios e documentos de saída.
  - `styles/` contém folhas de estilo modulares.
- **Build:** o script `build.js` combina partials, minifica arquivos e gera a pasta `dist/`.  Esse build é determinístico e não inclui dependências de terceiros.

## Back‑end

- **Ambiente:** Netlify Functions (Node.js 18) providencia execução serverless.  As funções residem em `netlify/functions/`.
- **API Router:** `netlify/functions/api/index.js` despacha as rotas `/api/*` para módulos específicos.  Funções auxiliares em `core.js` e `auth.js` tratam de cookies, CORS e verificação de permissões.
- **Funções principais:**
  - `api.js` expõe rotas para criação de processos, envio de evidências, consulta de registros públicos e operações administrativas.
  - `report.js` gera relatórios estruturados (JSON e HTML imprimível) e restringe o acesso a papéis autorizados.
  - `chat.js` integra opcionalmente com a OpenAI para fornecer suporte por chat (feature flag).
  - `telemetry*.js` coleta eventos de uso e métricas de performance.  No snapshot atual, esse endpoint apenas valida o payload e responde com um **ACK** (`204`), sem persistir os dados; serve como gancho para diagnosticar uso no futuro.

## Persistência e serviços externos

- **Supabase:** fornece banco de dados PostgreSQL, autenticação e armazenamento de arquivos.  Utiliza políticas de **Row Level Security** (RLS) para isolar dados entre empresas e usuários.  A aplicação conecta‑se via chamadas REST e `fetch`.
- **OpenAI API (opcional):** utilizada apenas se a variável `OPENAI_API_KEY` estiver configurada, para funcionalidades de chatbot.
- **Netlify:** além de hospedar o front‑end, gerencia a execução das funções serverless e o roteamento das URLs.

## Considerações de segurança

- O projeto utiliza cookies HttpOnly para manter a sessão do usuário e mitigar ataques de XSS.  As variáveis de ambiente são lidas em tempo de execução por functions e nunca expostas ao cliente.
- As rotas de API impõem validações de papéis e limites de taxa.  A integração com Supabase utiliza chaves separadas para contexto anônimo e de service role.
- A modularização do código facilita futuras evoluções sem comprometer a integridade do arranjo ou dos ativos institucionais.

Esta descrição está alinhada ao resumo técnico do e‑Software e ao inventário de arquivos.  Detalhes adicionais podem ser obtidos nos documentos `docs/ARCHITECTURE.md` e `docs/API.md` do repositório.