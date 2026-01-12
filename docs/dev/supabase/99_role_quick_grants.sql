/*
  99_role_quick_grants.sql (sanitized)
  ------------------------------------
  Objetivo: facilitar a concessão de papéis (roles) dentro do Programa NCS de Verificação Independente.
  Este script cria tipos, tabelas mínimas e uma função helper para atribuir papéis por e-mail.

  Contexto normativo:
  - Papéis suportados: `admin` (gestor/NCS), `auditor` (avaliador) e `client` (participante),
    em alinhamento com a segregação de funções descrita no Regulamento.  O papel `client` representa
    empresas candidatas/participantes; `auditor` subdivide-se em Avaliador Principal ou Revisor via
    `ncs_process_assignments` (não no role em si); `admin` cobre Operação e NCS, responsáveis por
    triagem, designação e decisão final【99705417965440†L410-L415】.
  - O backend determina o papel do usuário com base em `ncs_memberships`.  Usuários sem associação
    ativa são tratados como `client` por padrão.

  Uso:
  1) Execute este script no editor SQL do Supabase para provisionar tipos e tabelas mínimas, caso ainda
     não existam.  Ele é idempotente: rodar múltiplas vezes não causa conflitos.
  2) Depois, atribua papéis chamando `public.ncs_grant_role_by_email(email, role, company_slug?, company_name?)`,
     editando os parâmetros conforme necessário. Exemplos:
       -- Tornar um usuário ADMIN (global, company_id = NULL)
       select public.ncs_grant_role_by_email('SEU_EMAIL_ADMIN@exemplo.com', 'admin');

       -- Tornar um usuário AUDITOR. Se não houver uma empresa para pool, será criada automaticamente.
       select public.ncs_grant_role_by_email('SEU_EMAIL_AUDITOR@exemplo.com', 'auditor', 'auditor-pool', 'Auditoria (Pool)');

  3) Após executar a função, peça ao usuário para sair e entrar novamente no portal. Use `/api/auth/me` para verificar a atribuição.
*/

-- Dependência comum (gen_random_uuid). Em Supabase costuma existir.
create extension if not exists pgcrypto;

-- Função utilitária: slugify (usada por ncs_companies).
create or replace function public.ncs_slugify(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
    '(^-+)|(-+$)',
    '',
    'g'
  );
$$;

-- Enum de papéis (roles) mínimo.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ncs_role') then
    create type public.ncs_role as enum ('admin', 'auditor', 'client');
  end if;
end
$$;

-- Tabela mínima de companies (se ainda não existir).
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'ncs_companies'
  ) then
    create table public.ncs_companies (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      slug text not null unique,
      created_at timestamptz not null default now(),
      created_by uuid,
      metadata jsonb not null default '{}'::jsonb
    );
  end if;
end
$$;

-- Tabela mínima de memberships (se ainda não existir).
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'ncs_memberships'
  ) then
    create table public.ncs_memberships (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      company_id uuid references public.ncs_companies(id) on delete cascade,
      user_id uuid not null,
      role public.ncs_role not null,
      is_active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      -- Regra do modelo atual: admin é global (company_id NULL). Outros papéis exigem company.
      constraint ncs_memberships_role_company_ck check (
        (role = 'admin' and company_id is null) or
        (role <> 'admin' and company_id is not null)
      )
    );

    create index ncs_memberships_user_idx on public.ncs_memberships(user_id);
    create index ncs_memberships_company_idx on public.ncs_memberships(company_id);
    create index ncs_memberships_role_idx on public.ncs_memberships(role);
  end if;
end
$$;

-- Colunas essenciais, caso a tabela exista mas esteja incompleta (idempotente).
alter table public.ncs_memberships add column if not exists is_active boolean not null default true;
alter table public.ncs_memberships add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ncs_memberships add column if not exists updated_at timestamptz not null default now();

-- Trava simples contra múltiplos admins por usuário (porque NULL em unique não trava).
create unique index if not exists ncs_memberships_one_admin_per_user
  on public.ncs_memberships(user_id)
  where role = 'admin' and company_id is null;

-- Atualiza updated_at automaticamente.
create or replace function public.ncs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ncs_memberships_touch on public.ncs_memberships;
create trigger trg_ncs_memberships_touch
before update on public.ncs_memberships
for each row
execute procedure public.ncs_touch_updated_at();

/*
  Grant helper (por email)
  - Requer tabela auth.users (padrão do Supabase)
  - security definer para rodar como owner do schema (SQL editor)
*/
create or replace function public.ncs_grant_role_by_email(
  p_email text,
  p_role public.ncs_role,
  p_company_slug text default null,
  p_company_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_company uuid;
  v_membership uuid;
  v_slug text;
  v_name text;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email obrigatório';
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user is null then
    raise exception 'Usuário não encontrado em auth.users para email: %', p_email;
  end if;

  if p_role = 'admin' then
    select m.id into v_membership
    from public.ncs_memberships m
    where m.user_id = v_user and m.role = 'admin' and m.company_id is null
    limit 1;

    if v_membership is not null then
      update public.ncs_memberships set is_active = true where id = v_membership;
      return v_membership;
    end if;

    insert into public.ncs_memberships (company_id, user_id, role, is_active)
    values (null, v_user, 'admin', true)
    returning id into v_membership;

    return v_membership;
  end if;

  -- Papéis não-admin precisam de company.
  v_slug := public.ncs_slugify(coalesce(p_company_slug, ''));
  if v_slug = '' then
    v_slug := public.ncs_slugify(p_role::text || '-' || substr(md5(v_user::text), 1, 8));
  end if;

  v_name := coalesce(nullif(trim(p_company_name), ''), initcap(p_role::text) || ' Pool');

  select c.id into v_company
  from public.ncs_companies c
  where c.slug = v_slug
  limit 1;

  if v_company is null then
    insert into public.ncs_companies (name, slug, created_by)
    values (v_name, v_slug, v_user)
    returning id into v_company;
  end if;

  select m.id into v_membership
  from public.ncs_memberships m
  where m.user_id = v_user and m.company_id = v_company and m.role = p_role
  limit 1;

  if v_membership is not null then
    update public.ncs_memberships set is_active = true where id = v_membership;
    return v_membership;
  end if;

  insert into public.ncs_memberships (company_id, user_id, role, is_active)
  values (v_company, v_user, p_role, true)
  returning id into v_membership;

  return v_membership;
end;
$$;

-- Fim do arquivo.
