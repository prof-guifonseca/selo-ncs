# Documentação (mapa)

Este conjunto foi refeito com base **no estado real do código** (SPA + Netlify Functions + Supabase), e substitui a leitura de rascunhos/artefatos antigos.

## Comece por aqui

1) `STATUS.md` — o que está implementado, o que é legado, e onde está no código  
2) `DIAGNOSTIC.md` — inconsistências, stubs e ganhos rápidos (robustez/valor percebido)  
3) `ARCHITECTURE.md` — visão de sistema (fluxos + componentes)  
4) `API.md` — contratos das rotas (métodos, payloads e papéis)

## Operação / Dev / Deploy

- `ENV.md` — variáveis de ambiente (fonte única de verdade)
- `SMOKE_TESTS.md` — smoke do front e do backend (inclui RLS hard gate)
- `DEPLOY.md` — como publicar em Netlify e ajustar headers/redirects
- `dev/SECURITY_MODEL.md` — detalhe operacional do modelo de segurança (referenciado pelo código)
- `dev/SUPABASE_SETUP.md` — setup determinístico (ordem dos .sql)
- `dev/DATA_MODEL.md` — mapa de tabelas/campos (resumo do schema)
 - `dev/DATA_MODEL.md` — mapa de tabelas/campos (resumo do schema)
 - `front/FRONTEND_HANDBOOK.md` — manual prático de front (roteador, convenções de HTML/JS, checklist de PR e debug rápido)

## Roadmap e melhorias contínuas

Os documentos de roadmap foram removidos para reduzir ruído e evitar
contradições com o código.  As recomendações de melhorias e a lista de
pendências estão incorporadas em `STATUS.md` e `DIAGNOSTIC.md`.  Para
acompanhamento de backlog e planejamento futuro, consulte essas páginas
ou o repositório de issues. Não há mais arquivos dedicados a prognósticos.

## Visão do Programa

- `PROGRAM_OVERVIEW.md` — manual operacional do programa.  Traduz o
  regulamento para um fluxo claro de autoavaliação, triagem,
  avaliação, alinhamento, decisão e uso do selo.  Define papéis
  (participante, avaliador principal, avaliador revisor e
  administrador) e os respectivos acessos no MVP.

## Planejamento de release

- `RELEASE_CHECKLIST.md` — checklist de release e critérios de aceite
  para cada etapa (pré‑release, release e pós‑release), com foco em
  robustez e validação objetiva.
