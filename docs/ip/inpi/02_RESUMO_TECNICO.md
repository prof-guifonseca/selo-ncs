# Resumo Técnico do Software (e‑Software)

Este resumo apresenta, em linguagem não técnica, as funcionalidades e a arquitetura essenciais da **Plataforma Operacional do Programa MES (Meu Empreendimento Sustentável)**.  O objetivo é permitir ao INPI identificar a obra de forma inequívoca sem expor o código‑fonte ou segredos de negócio.

A Plataforma implementa uma aplicação web de verificação independente voltada a iniciativas de sustentabilidade.  Seus usuários se dividem em três papéis – participantes (clientes), avaliadores independentes e administradores.  Os principais recursos são:

- **Cadastro e autenticação**: usuários podem registrar‑se e autenticar‑se via formulário web.  A sessão é mantida por cookies HttpOnly, com suporte a autenticação anônima sob regras de “Row Level Security”.
- **Dashboards dedicados**: cada tipo de usuário possui um painel personalizado para acompanhar processos de verificação, evidências enviadas, pareceres e resultados.  Os dashboards são construídos com JavaScript do lado do cliente (SPA) e comunicam‑se com o backend via API REST.
- **Gerenciamento de processos**: participantes iniciam processos de verificação e fazem upload de evidências; avaliadores registram análises e pontuações; administradores coordenam fluxos e autorizam a emissão de relatórios.
- **Geração de relatórios**: uma função de backend produz relatórios estruturados em JSON ou HTML pronto para impressão, contendo trilha de auditoria, evidências e indicadores de desempenho.

### Arquitetura

O software segue o paradigma *static‑first*: o front‑end é uma SPA em Vanilla JavaScript que é construída a partir de partials HTML pelo script `build.js` e distribuída como arquivos estáticos.  O back‑end é implementado como funções serverless em Node.js no ambiente Netlify Functions.  A API está definida em `netlify/functions/api`, com rotas para autenticação, gestão de processos, manipulação de evidências e publicação de páginas públicas.  Os dados são armazenados em um banco PostgreSQL gerenciado pela Supabase, com regras de controle de acesso e políticas de **Row Level Security**.

A infraestrutura integra‑se opcionalmente ao **OpenAI API** para oferecer recursos de chat/contexto guiado, mediante feature flag.  Todas as dependências externas são listadas em `../dossie/06_THIRD_PARTY_E_LICENCAS.md`.

### Escopo

O resumo aplica‑se apenas ao código e artefatos da Plataforma, conforme delimitado em `../dossie/02_QUADRO_DE_DELIMITACAO_MES_ARRANJO_PLATAFORMA.md`: marca “MES”, identidade visual e documentos institucionais pertencem à NCS【689463090271669†L390-L404】; o Arranjo do Programa (metodologia e documentos) e a Plataforma (código‑fonte e arquitetura) são de titularidade do Operador【689463090271669†L405-L435】.  Este resumo não abrange segredos de configuração, dados de usuários ou chaves de acesso.