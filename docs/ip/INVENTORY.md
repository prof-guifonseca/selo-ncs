<!--
  DEPRECATED
  Este inventário foi elaborado para o programa anterior “NCS: Governança & Impacto” e encontra-se desatualizado.
  Consulte `docs/ip/dossie/05_INVENTARIO_DE_ARQUIVOS.md` para a versão válida relacionada ao Programa MES.
-->

# Inventário técnico (alto nível)

## Núcleo (proprietário)
- `build.js` (pipeline static-first)
- `src/*` (SPA e dashboards)
- `netlify/functions/api/*` (router + rotas + segurança)
- `netlify/functions/report.js` (relatório imprimível)
- `docs/dev/supabase/*.sql` (schema/policies)

## Componentes de plataforma (não proprietários)
- Netlify runtime (hosting + functions)
- Supabase (Postgres + Storage)
- OpenAI API (se habilitada)

## Observação
O valor técnico do repo está em:
- desenho static-first barato
- multi-tenant com hard gate (RLS)
- trilha de auditoria/relatórios/publicação
