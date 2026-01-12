-- 10_schema.sql (sanitized) — Definição de esquema para o Programa de Verificação Independente NCS.
--
-- Este arquivo cria e reconcilia as tabelas principais do programa de verificação de ESG:
--   • `ncs_companies` – tenantes (empresas) participantes.
--   • `ncs_memberships` – vincula usuários às empresas e define o papel (`client`, `auditor` ou `admin`).
--   • `ncs_processes` – processos de verificação, com estágios e status derivados do payload JSON.
--   • `ncs_process_assignments` – atribui avaliadores aos processos, com papéis `principal` e `reviewer`.
--   • `ncs_evidences` – evidências anexadas aos processos.
--   • `ncs_public_pages` – páginas públicas/dossiês publicados.
--   • `ncs_sessions` e `ncs_app_state` – sessões e preferências de UI.
--   • `ncs_audit_log` – trilha de auditoria persistente, com triggers automáticos para processos e evidências.
--
-- A estrutura é idempotente: se as tabelas existirem, novas colunas são adicionadas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
-- Roles e enumerações:
--   • `ncs_role`: `admin` (gestor), `auditor` (avaliador) e `client` (participante).
--   • `ncs_assignment_role`: `principal` ou `reviewer` para distinguir avaliadores principal e revisor.
--   • `ncs_pillar`: `E`, `S`, `G` para classificar evidências.
-- As triggers de `updated_at` são recriadas sempre para manter coerência com futuras alterações.

--
-- ## Observações sobre `ncs_processes` e o fluxo normativo
--
-- O Programa NCS adota um fluxo de estágios e status documentado no Regulamento.  A coluna
-- `payload` da tabela `ncs_processes` armazena essas informações em um JSONB.  Os campos
-- `stage` e `status` gerados (virtual columns) extraem valores de `payload` para uso em filtros e índices.
--
-- Os valores de `stage` representam fases do ciclo, por exemplo:
--   • `inscricao` – inscrição e autoavaliação; o participante ainda não enviou evidências.
--   • `triagem` – admissibilidade formal e higienização de dados. Caso haja falhas, o status pode mudar para
--     `pendente_complemento`, notificando o participante para corrigir pendências (prazo típico: 5 dias úteis)【99705417965440†L399-L406】.
--   • `avaliacao` – análise técnica documental pelos Avaliadores Principal e Revisor; apenas uma rodada de
--     complementação é permitida【99705417965440†L424-L432】.
--   • `alinhamento` – etapa opcional em que a NCS solicita alinhamento técnico quando há divergência significativa entre os
--     pareceres dos avaliadores【99705417965440†L489-L496】.
--   • `decisao` – deliberação final da NCS com base nos relatórios técnicos, podendo resultar em
--     `validado`, `validado_condicionado` (quando previsto) ou `reprovado`【99705417965440†L500-L507】.
--   • `recursos` – fase em que o participante interpõe recurso administrativo (quando cabível, conforme item 4.5 do Regulamento).
--
-- O campo `status` complementa o `stage` com subestados mais granulares (ex.: `pendente_complemento`,
-- `em_devolutiva`, `aguardando_avaliacao`, `aguardando_revisao`, `aguardando_decisao`, `arquivado`, etc.).  A lista
-- exata de status pode variar por ciclo e é definida na Metodologia; por isso não é modelada como enumeração fixa.
--
-- A escolha por armazenar `stage` e `status` em um JSONB permite flexibilidade para novos ciclos
-- sem necessidade de migrações estruturais. Aplicações clientes devem tratar os valores conforme a
-- documentação normativa e fornecer feedback ao usuário quando um status estiver em transição.

create extension if not exists citext;
create extension if not exists pgcrypto;

begin;

create or replace function public.ncs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ncs_slugify(input text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(input,'')),'[^a-z0-9]+','-','g'),
    '-{2,}','-','g'
  ));
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ncs_role') then
    create type public.ncs_role as enum ('admin','auditor','client');
  end if;
  if not exists (select 1 from pg_type where typname = 'ncs_pillar') then
    create type public.ncs_pillar as enum ('E','S','G');
  end if;
  if not exists (select 1 from pg_type where typname = 'ncs_assignment_role') then
    create type public.ncs_assignment_role as enum ('principal','reviewer');
  end if;
end $$;

/* ============================================================================
  ncs_companies
============================================================================ */

create table if not exists public.ncs_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ncs_companies_slug_ck check (length(slug::text) >= 3)
);

-- Reconcile (se a tabela já existia, garante colunas usadas por índices/triggers)
alter table if exists public.ncs_companies
  add column if not exists name text,
  add column if not exists slug citext,
  add column if not exists created_by uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Defaults (seguros)
alter table if exists public.ncs_companies
  alter column created_by set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_companies_created_by on public.ncs_companies(created_by);

drop trigger if exists trg_ncs_companies_updated_at on public.ncs_companies;
create trigger trg_ncs_companies_updated_at
before update on public.ncs_companies
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_memberships
============================================================================ */

create table if not exists public.ncs_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.ncs_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.ncs_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ncs_memberships_company_role_ck check (
    (role='admin' and company_id is null) or (role<>'admin' and company_id is not null)
  )
);

alter table if exists public.ncs_memberships
  add column if not exists company_id uuid,
  add column if not exists user_id uuid,
  add column if not exists role public.ncs_role,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_memberships
  alter column updated_at set default now(),
  alter column created_at set default now();

create unique index if not exists uidx_ncs_memberships_unique on public.ncs_memberships(company_id,user_id,role);
create index if not exists idx_ncs_memberships_user_id on public.ncs_memberships(user_id);
create index if not exists idx_ncs_memberships_company_id on public.ncs_memberships(company_id);
create index if not exists idx_ncs_memberships_role on public.ncs_memberships(role);

drop trigger if exists trg_ncs_memberships_updated_at on public.ncs_memberships;
create trigger trg_ncs_memberships_updated_at
before update on public.ncs_memberships
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_processes
============================================================================ */

create table if not exists public.ncs_processes (
  id text primary key,
  company_id uuid null references public.ncs_companies(id) on delete set null,
  owner_id uuid null references auth.users(id) on delete set null default auth.uid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_name text generated always as (nullif(payload->>'company','')) stored,
  stage text generated always as (nullif(payload->>'stage','')) stored,
  status text generated always as (nullif(payload->>'status','')) stored,
  constraint ncs_processes_id_ck check (id ~* '^proc_[0-9a-f-]{32,36}$'),
  constraint ncs_processes_company_in_payload_ck check (payload ? 'company' and length(trim(payload->>'company'))>0)
);

alter table if exists public.ncs_processes
  add column if not exists company_id uuid,
  add column if not exists owner_id uuid,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists company_name text generated always as (nullif(payload->>'company','')) stored,
  add column if not exists stage text generated always as (nullif(payload->>'stage','')) stored,
  add column if not exists status text generated always as (nullif(payload->>'status','')) stored;

alter table if exists public.ncs_processes
  alter column owner_id set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_processes_company_id on public.ncs_processes(company_id);
create index if not exists idx_ncs_processes_owner_id on public.ncs_processes(owner_id);
create index if not exists idx_ncs_processes_stage on public.ncs_processes(stage);
create index if not exists idx_ncs_processes_status on public.ncs_processes(status);
create index if not exists idx_ncs_processes_updated_at on public.ncs_processes(updated_at desc);
create index if not exists gin_ncs_processes_payload on public.ncs_processes using gin (payload jsonb_path_ops);

drop trigger if exists trg_ncs_processes_updated_at on public.ncs_processes;
create trigger trg_ncs_processes_updated_at
before update on public.ncs_processes
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_process_assignments
============================================================================ */

create table if not exists public.ncs_process_assignments (
  id uuid primary key default gen_random_uuid(),
  process_id text not null references public.ncs_processes(id) on delete cascade,
  auditor_id uuid not null references auth.users(id) on delete cascade,
  role public.ncs_assignment_role not null default 'principal',
  assigned_by uuid null references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ncs_process_assignments
  add column if not exists process_id text,
  add column if not exists auditor_id uuid,
  add column if not exists role public.ncs_assignment_role,
  add column if not exists assigned_by uuid,
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_process_assignments
  alter column role set default 'principal',
  alter column updated_at set default now(),
  alter column created_at set default now();

create unique index if not exists uidx_ncs_process_assignments_process_role on public.ncs_process_assignments(process_id,role);
create unique index if not exists uidx_ncs_process_assignments_process_auditor on public.ncs_process_assignments(process_id,auditor_id);
create index if not exists idx_ncs_process_assignments_auditor on public.ncs_process_assignments(auditor_id);

drop trigger if exists trg_ncs_process_assignments_updated_at on public.ncs_process_assignments;
create trigger trg_ncs_process_assignments_updated_at
before update on public.ncs_process_assignments
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_evidences
============================================================================ */

create table if not exists public.ncs_evidences (
  id text primary key,
  pillar public.ncs_pillar not null,
  indicator_id text null,
  meta jsonb not null default '{}'::jsonb,
  storage_bucket text not null default 'ncs-evidences',
  storage_path text null,
  file_name text null,
  content_type text null,
  size_bytes bigint null,
  sha256_hex text null,
  owner_id uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ncs_evidences_id_ck check (id ~* '^ev_[0-9a-f-]{32,36}$')
);

alter table if exists public.ncs_evidences
  add column if not exists pillar public.ncs_pillar,
  add column if not exists indicator_id text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists storage_bucket text not null default 'ncs-evidences',
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists size_bytes bigint,
  add column if not exists sha256_hex text,
  add column if not exists owner_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_evidences
  alter column owner_id set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_evidences_owner_id on public.ncs_evidences(owner_id);
create index if not exists idx_ncs_evidences_pillar on public.ncs_evidences(pillar);
create index if not exists idx_ncs_evidences_indicator_id on public.ncs_evidences(indicator_id);
create index if not exists idx_ncs_evidences_updated_at on public.ncs_evidences(updated_at desc);
create index if not exists gin_ncs_evidences_meta on public.ncs_evidences using gin (meta jsonb_path_ops);

drop trigger if exists trg_ncs_evidences_updated_at on public.ncs_evidences;
create trigger trg_ncs_evidences_updated_at
before update on public.ncs_evidences
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_public_pages
============================================================================ */

create table if not exists public.ncs_public_pages (
  id text primary key,
  slug citext not null unique,
  payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ncs_public_pages_id_ck check (id ~* '^pub_[0-9a-f-]{32,36}$')
);

alter table if exists public.ncs_public_pages
  add column if not exists slug citext,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists published boolean not null default true,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_public_pages
  alter column created_by set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_public_pages_published on public.ncs_public_pages(published);

drop trigger if exists trg_ncs_public_pages_updated_at on public.ncs_public_pages;
create trigger trg_ncs_public_pages_updated_at
before update on public.ncs_public_pages
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_sessions
============================================================================ */

create table if not exists public.ncs_sessions (
  id text primary key,
  user_id uuid null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ncs_sessions
  add column if not exists user_id uuid,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_sessions
  alter column user_id set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_sessions_user_id on public.ncs_sessions(user_id);
create index if not exists idx_ncs_sessions_expires_at on public.ncs_sessions(expires_at);

drop trigger if exists trg_ncs_sessions_updated_at on public.ncs_sessions;
create trigger trg_ncs_sessions_updated_at
before update on public.ncs_sessions
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_app_state
============================================================================ */

create table if not exists public.ncs_app_state (
  id text primary key,
  owner_id uuid null references auth.users(id) on delete set null default auth.uid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ncs_app_state
  add column if not exists owner_id uuid,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.ncs_app_state
  alter column owner_id set default auth.uid(),
  alter column updated_at set default now(),
  alter column created_at set default now();

create index if not exists idx_ncs_app_state_owner_id on public.ncs_app_state(owner_id);
create index if not exists idx_ncs_app_state_updated_at on public.ncs_app_state(updated_at desc);

drop trigger if exists trg_ncs_app_state_updated_at on public.ncs_app_state;
create trigger trg_ncs_app_state_updated_at
before update on public.ncs_app_state
for each row execute function public.ncs_set_updated_at();

/* ============================================================================
  ncs_audit_log + audit triggers
============================================================================ */

create table if not exists public.ncs_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid null references auth.users(id) on delete set null,
  company_id uuid null references public.ncs_companies(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before jsonb null,
  after jsonb null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ncs_audit_log_entity on public.ncs_audit_log(entity_type,entity_id);
create index if not exists idx_ncs_audit_log_company on public.ncs_audit_log(company_id);
create index if not exists idx_ncs_audit_log_actor on public.ncs_audit_log(actor_id);
create index if not exists idx_ncs_audit_log_occurred_at on public.ncs_audit_log(occurred_at desc);

create or replace function public.ncs_audit_processes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,after)
    values (auth.uid(),new.company_id,'process',new.id,'insert',new.payload);
    return new;
  elsif tg_op='UPDATE' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,before,after)
    values (auth.uid(),new.company_id,'process',new.id,'update',old.payload,new.payload);
    return new;
  elsif tg_op='DELETE' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,before)
    values (auth.uid(),old.company_id,'process',old.id,'delete',old.payload);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.ncs_audit_evidences()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,after)
    values (auth.uid(),null,'evidence',new.id,'insert',new.meta);
    return new;
  elsif tg_op='UPDATE' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,before,after)
    values (auth.uid(),null,'evidence',new.id,'update',old.meta,new.meta);
    return new;
  elsif tg_op='DELETE' then
    insert into public.ncs_audit_log(actor_id,company_id,entity_type,entity_id,action,before)
    values (auth.uid(),null,'evidence',old.id,'delete',old.meta);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ncs_processes_audit on public.ncs_processes;
create trigger trg_ncs_processes_audit
after insert or update or delete on public.ncs_processes
for each row execute function public.ncs_audit_processes();

drop trigger if exists trg_ncs_evidences_audit on public.ncs_evidences;
create trigger trg_ncs_evidences_audit
after insert or update or delete on public.ncs_evidences
for each row execute function public.ncs_audit_evidences();

/* ============================================================================
  Views
============================================================================ */

create or replace view public.ncs_v_process_summary as
select p.id,p.company_id,p.company_name,p.stage,p.status,p.owner_id,p.created_at,p.updated_at
from public.ncs_processes p;

commit;
