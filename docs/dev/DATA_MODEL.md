# Modelo de dados (resumo)

O schema completo está em `docs/dev/supabase/10_schema.sql`. Abaixo, um mapa mental do que importa para entender o produto.

## Entidades de governança (multi-tenant)

- `ncs_companies`
  - representa o tenant (empresa/organização)

- `ncs_memberships`
  - liga `user_id` ↔ `company_id` com `role` (`admin`, `auditor`, `client`)
  - é a chave para isolamento e autorização

## Auditoria e preferências

- `ncs_audit_log`
  - trilha de ações relevantes (eventos)
  - útil para rastreabilidade, incidentes e accountability

- `ncs_app_state`
  - preferências de UI persistidas por usuário

## Operação (o produto em si)

- `ncs_processes`
  - processo de validação/auditoria (payload + status)
  - base para decisão, publicação e relatórios

- `ncs_evidences`
  - evidências (metadados + storage key)
  - upload/view via URLs assinadas

- `ncs_public_pages`
  - snapshot publicado (página pública / certificado / etc.)

## Recomendação de robustez

Para “valor percebido” e segurança:
- `memberships` deve ser o “pivô” (RLS e validações)
- `audit_log` deve registrar eventos essenciais (publish/decisão/mudanças críticas)
