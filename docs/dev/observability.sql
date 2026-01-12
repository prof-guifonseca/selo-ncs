-- observability.sql (sanitized) — Observabilidade mínima.
--
-- Este script cria a tabela `ncs_audit_log` para registrar eventos relevantes
-- do programa. A tabela guarda informações sobre quem fez o quê, quando,
-- sobre qual entidade e com metadados adicionais (JSON). O design é idempotente:
-- rodar este arquivo no Supabase repetidamente não causa erros. É uma
-- alternativa simplificada ao esquema completo de audit log definido
-- em `docs/dev/supabase/10_schema.sql` quando se deseja apenas registrar ações.

--
-- ## Observações normativas
--
-- A Política de Observabilidade do programa requer que eventos críticos
-- sejam registrados para garantir rastreabilidade e accountability.  A tabela
-- `ncs_audit_log` armazena quem fez o quê, quando, em qual entidade e com
-- metadados adicionais.  Eventos típicos incluem: submissão de evidências,
-- triagem (aceite ou pendência), designação de avaliadores, registro de
-- devolutivas/complementações, elaboração de relatórios técnicos, decisões
-- da NCS (validado, condicionado, reprovado) e interposição de recursos.  O
-- uso dessa tabela complementa o esquema mais robusto de `ncs_audit_log` no
-- arquivo 10_schema.sql, podendo ser adotado isoladamente em contextos onde
-- se deseja apenas rastrear ações sem os gatilhos complexos.

begin;

create table if not exists public.ncs_audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid null,
  company_id uuid null,
  action text not null,
  entity_type text null,
  entity_id text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists ncs_audit_log_occurred_at_idx on public.ncs_audit_log (occurred_at desc);
create index if not exists ncs_audit_log_action_idx on public.ncs_audit_log (action);
create index if not exists ncs_audit_log_company_id_idx on public.ncs_audit_log (company_id);
create index if not exists ncs_audit_log_actor_id_idx on public.ncs_audit_log (actor_id);

commit;
