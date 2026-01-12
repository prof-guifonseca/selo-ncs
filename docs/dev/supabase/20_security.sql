-- 20_security.sql (sanitized) — Políticas de segurança e RLS para o Programa NCS.
--
-- Este arquivo define permissões e políticas de Row Level Security (RLS) para proteger os dados de acordo
-- com os papéis previstos no programa:
--   • **Clientes (participantes)** podem ler e escrever somente dados ligados às suas empresas e processos;
--   • **Auditores (principal ou revisor)** podem acessar processos aos quais foram designados via `ncs_process_assignments`;
--   • **Admins (gestores/NCS)** têm acesso irrestrito e são responsáveis por triagem, designação e decisão final.
--
-- Helpers (functions) como `ncs_is_admin`, `ncs_is_auditor`, `ncs_has_company_access` e `ncs_can_access_process`
-- encapsulam as regras de acesso e são usadas nos policies abaixo. As grants concedem operações básicas
-- (select, insert, update, delete) a usuários autenticados quando aplicável. Os policies RLS
-- garantem isolamento de tenant e segregação por papel.

--
-- ## Observações normativas
--
-- O Regulamento do Programa estabelece segregação de funções entre Participante (client), Avaliadores
-- (auditor principal e revisor) e NCS/Admin (gestor).  As políticas de segurança refletem essa divisão:
--
--   • **Participantes** podem ler e escrever apenas dados da própria empresa/processo. Eles não têm acesso a
--     processos de outras empresas nem a dados dos avaliadores.  Isso garante confidencialidade e privacidade.
--   • **Avaliadores** acessam somente os processos aos quais foram designados via `ncs_process_assignments`.
--     Podem ler evidências e atualizá-las com seus pareceres, mas não alteram informações do participante nem
--     decidem o resultado final.  Funções como `ncs_is_assigned_auditor()` implementam essa regra【99705417965440†L418-L461】.
--   • **Admins/NCS** possuem acesso irrestrito, pois são responsáveis por triagem, designação e decisão final【99705417965440†L468-L504】.
--
-- A RLS é ativada em todas as tabelas e as funções auxiliares (declarações `ncs_is_admin`,
-- `ncs_can_access_process`, etc.) encapsulam a lógica para facilitar futuras alterações sem duplicar código.
begin;

grant usage on schema public to anon, authenticated;

grant select,insert,update,delete on public.ncs_companies to authenticated;
grant select,insert,update,delete on public.ncs_memberships to authenticated;
grant select,insert,update,delete on public.ncs_processes to authenticated;
grant select,insert,update,delete on public.ncs_process_assignments to authenticated;
grant select,insert,update,delete on public.ncs_evidences to authenticated;
grant select on public.ncs_public_pages to anon, authenticated;
grant insert,update,delete on public.ncs_public_pages to authenticated;
grant select,insert,update,delete on public.ncs_sessions to authenticated;
grant select,insert,update,delete on public.ncs_app_state to authenticated;
grant select,insert on public.ncs_audit_log to authenticated;

create or replace function public.ncs_is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.ncs_memberships m
    where m.user_id=uid and m.role='admin' and m.is_active=true and m.company_id is null
  );
$$;

create or replace function public.ncs_is_auditor(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.ncs_memberships m
    where m.user_id=uid and m.role='auditor' and m.is_active=true
  );
$$;

create or replace function public.ncs_has_company_access(company uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.ncs_memberships m
    where m.user_id=uid and m.company_id=company and m.is_active=true
  ) or public.ncs_is_admin(uid);
$$;

create or replace function public.ncs_is_assigned_auditor(process text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.ncs_process_assignments a
    where a.process_id=process and a.auditor_id=uid
  ) or public.ncs_is_admin(uid);
$$;

create or replace function public.ncs_can_access_process(process text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.ncs_is_admin(uid)
     or public.ncs_is_assigned_auditor(process,uid)
     or exists (select 1 from public.ncs_processes p where p.id=process and p.company_id is not null and public.ncs_has_company_access(p.company_id,uid))
     or exists (select 1 from public.ncs_processes p where p.id=process and p.owner_id=uid);
$$;

create or replace function public.ncs_can_access_evidence(evidence text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.ncs_is_admin(uid)
     or exists (select 1 from public.ncs_evidences e where e.id=evidence and e.owner_id=uid)
     or exists (select 1 from public.ncs_processes p where public.ncs_can_access_process(p.id,uid) and (p.payload->'evidenceIds') ? evidence);
$$;

alter table public.ncs_companies enable row level security;
alter table public.ncs_memberships enable row level security;
alter table public.ncs_processes enable row level security;
alter table public.ncs_process_assignments enable row level security;
alter table public.ncs_evidences enable row level security;
alter table public.ncs_public_pages enable row level security;
alter table public.ncs_sessions enable row level security;
alter table public.ncs_app_state enable row level security;
alter table public.ncs_audit_log enable row level security;

-- ncs_companies_select: allow members of a company (or global admins) to read
-- company records.  Relies on the helper function
-- ncs_has_company_access() which checks for an active membership or
-- admin role.  Without a matching membership the row is invisible.
drop policy if exists ncs_companies_select on public.ncs_companies;
create policy ncs_companies_select on public.ncs_companies
for select to authenticated using (public.ncs_has_company_access(id));

-- ncs_companies_insert: any authenticated user may create a new
-- company.  Enforces that the created_by column matches the current
-- auth.uid() so that the audit trail identifies the creator.
drop policy if exists ncs_companies_insert on public.ncs_companies;
create policy ncs_companies_insert on public.ncs_companies
for insert to authenticated with check (created_by = auth.uid());

-- ncs_companies_update: only global admins can modify company
-- records.  Both the USING and WITH CHECK clauses call
-- ncs_is_admin() to ensure the current user has a global admin
-- membership (role='admin' and company_id is null).
drop policy if exists ncs_companies_update on public.ncs_companies;
create policy ncs_companies_update on public.ncs_companies
for update to authenticated using (public.ncs_is_admin()) with check (public.ncs_is_admin());

-- ncs_companies_delete: only global admins may delete companies.
drop policy if exists ncs_companies_delete on public.ncs_companies;
create policy ncs_companies_delete on public.ncs_companies
for delete to authenticated using (public.ncs_is_admin());

-- ncs_memberships_select: allow global admins to list all
-- memberships.  Regular users can only see their own membership rows.
drop policy if exists ncs_memberships_select on public.ncs_memberships;
create policy ncs_memberships_select on public.ncs_memberships
for select to authenticated using (public.ncs_is_admin() or user_id = auth.uid());

-- ncs_memberships_insert: only global admins may grant memberships
-- (add users to companies or create admin memberships).  The WITH
-- CHECK clause prevents escalation by regular users.
drop policy if exists ncs_memberships_insert on public.ncs_memberships;
-- Permite que somente administradores criem memberships livremente.
-- Para auto-onboarding de clientes, permite inserção quando:
--   • o papel é 'client';
--   • o user_id é o próprio auth.uid();
--   • a empresa foi criada pelo usuário (created_by = auth.uid()).
-- Isso evita escalada de privilégios e impede que usuários criem memberships
-- para outras empresas ou com papéis diferentes.  Comentário: SELF_REGISTER_CLIENT_ONLY.
create policy ncs_memberships_insert on public.ncs_memberships
for insert to authenticated
  with check (
    public.ncs_is_admin() or
    (
      role = 'client'
      and user_id = auth.uid()
      and company_id in (select id from public.ncs_companies where created_by = auth.uid())
    )
  );

-- ncs_memberships_update: only global admins may modify existing
-- memberships (e.g. change role, deactivate).  Both USING and
-- WITH CHECK enforce admin role.
drop policy if exists ncs_memberships_update on public.ncs_memberships;
create policy ncs_memberships_update on public.ncs_memberships
for update to authenticated using (public.ncs_is_admin()) with check (public.ncs_is_admin());

-- ncs_memberships_delete: only global admins may remove a
-- membership.
drop policy if exists ncs_memberships_delete on public.ncs_memberships;
create policy ncs_memberships_delete on public.ncs_memberships
for delete to authenticated using (public.ncs_is_admin());

-- ncs_processes_select: authenticated users may read process rows
-- they own or are assigned to (auditor) or when they belong to the
-- associated company.  The helper ncs_can_access_process() checks
-- ownership, assignments and admin membership.
drop policy if exists ncs_processes_select on public.ncs_processes;
create policy ncs_processes_select on public.ncs_processes
for select to authenticated using (public.ncs_can_access_process(id));

-- ncs_processes_insert: regular users may create new processes they
-- own.  Global admins may override owner_id to assign a different
-- owner.  The WITH CHECK clause enforces this.
drop policy if exists ncs_processes_insert on public.ncs_processes;
create policy ncs_processes_insert on public.ncs_processes
for insert to authenticated with check ((owner_id = auth.uid()) or public.ncs_is_admin());

-- ncs_processes_update: allows updates only when the current user
-- can access the process.  Both USING and WITH CHECK call
-- ncs_can_access_process(id) so that owners and assigned auditors
-- may modify their processes.  Global admins always have access.
drop policy if exists ncs_processes_update on public.ncs_processes;
create policy ncs_processes_update on public.ncs_processes
for update to authenticated using (public.ncs_can_access_process(id)) with check (public.ncs_can_access_process(id));

-- ncs_processes_delete: only global admins may delete processes.
drop policy if exists ncs_processes_delete on public.ncs_processes;
create policy ncs_processes_delete on public.ncs_processes
for delete to authenticated using (public.ncs_is_admin());

-- ncs_process_assignments_select: allow global admins to view all
-- assignments.  Auditors may see assignments where they are the
-- auditor_id.  Additionally, users with access to the underlying
-- process can see assignments for that process (e.g. process owner or
-- company member).
drop policy if exists ncs_process_assignments_select on public.ncs_process_assignments;
create policy ncs_process_assignments_select on public.ncs_process_assignments
for select to authenticated using (public.ncs_is_admin() or auditor_id = auth.uid() or public.ncs_can_access_process(process_id));

-- ncs_process_assignments_write: only global admins may create,
-- update or delete assignments.  Auditors cannot self‑assign via
-- direct writes; assignments are controlled by admin flows.
drop policy if exists ncs_process_assignments_write on public.ncs_process_assignments;
create policy ncs_process_assignments_write on public.ncs_process_assignments
for all to authenticated using (public.ncs_is_admin()) with check (public.ncs_is_admin());

-- ncs_evidences_select: allow users to read evidence when they are
-- the owner or when the evidence is referenced by a process they
-- have access to.  Admins can always read.  This relies on the
-- helper ncs_can_access_evidence().
drop policy if exists ncs_evidences_select on public.ncs_evidences;
create policy ncs_evidences_select on public.ncs_evidences
for select to authenticated using (public.ncs_can_access_evidence(id));

-- ncs_evidences_insert: regular users may insert evidence that they
-- own; admins may insert on behalf of others.  The WITH CHECK
-- clause ensures proper ownership.
drop policy if exists ncs_evidences_insert on public.ncs_evidences;
create policy ncs_evidences_insert on public.ncs_evidences
for insert to authenticated with check (owner_id = auth.uid() or public.ncs_is_admin());

-- ncs_evidences_update: evidence can be modified by its owner, by
-- users who can access the parent process or by admins.  Both USING
-- and WITH CHECK call ncs_can_access_evidence().
drop policy if exists ncs_evidences_update on public.ncs_evidences;
create policy ncs_evidences_update on public.ncs_evidences
for update to authenticated using (public.ncs_can_access_evidence(id)) with check (public.ncs_can_access_evidence(id));

-- ncs_evidences_delete: evidence may be deleted by its owner or
-- global admins.
drop policy if exists ncs_evidences_delete on public.ncs_evidences;
create policy ncs_evidences_delete on public.ncs_evidences
for delete to authenticated using (public.ncs_is_admin() or owner_id = auth.uid());

-- ncs_public_pages_select_anon: anonymous users may read only
-- published public pages.
drop policy if exists ncs_public_pages_select_anon on public.ncs_public_pages;
create policy ncs_public_pages_select_anon on public.ncs_public_pages
for select to anon using (published=true);

-- ncs_public_pages_select_authed: authenticated users may read
-- published pages.  Admins can also see unpublished drafts.
drop policy if exists ncs_public_pages_select_authed on public.ncs_public_pages;
create policy ncs_public_pages_select_authed on public.ncs_public_pages
for select to authenticated using (published=true or public.ncs_is_admin());

-- ncs_public_pages_write: only admins may create, update or delete
-- public pages.  Regular users cannot write.
drop policy if exists ncs_public_pages_write on public.ncs_public_pages;
create policy ncs_public_pages_write on public.ncs_public_pages
for all to authenticated using (public.ncs_is_admin()) with check (public.ncs_is_admin());

-- ncs_sessions_rw: session rows are keyed by user id.  Users may
-- read and write their own session.  Admins may read and write
-- any session.
drop policy if exists ncs_sessions_rw on public.ncs_sessions;
create policy ncs_sessions_rw on public.ncs_sessions
for all to authenticated using (public.ncs_is_admin() or user_id = auth.uid())
with check (public.ncs_is_admin() or user_id = auth.uid());

-- ncs_app_state_rw: app state rows are keyed by owner_id.  Users may
-- read and write their own state.  Admins have blanket access.
drop policy if exists ncs_app_state_rw on public.ncs_app_state;
create policy ncs_app_state_rw on public.ncs_app_state
for all to authenticated using (public.ncs_is_admin() or owner_id = auth.uid())
with check (public.ncs_is_admin() or owner_id = auth.uid());

-- The audit log holds immutable events keyed to various entities.
-- Allow admins to access all rows.  Additionally allow users to read
-- events tied to processes or evidences they can access via the helper
-- functions ncs_can_access_process and ncs_can_access_evidence.  This
-- policy does not expose audit rows from other tenants.
drop policy if exists ncs_audit_log_select on public.ncs_audit_log;
create policy ncs_audit_log_select on public.ncs_audit_log
for select to authenticated
using (
  public.ncs_is_admin()
  or (entity_type = 'process' and public.ncs_can_access_process(entity_id))
  or (entity_type = 'evidence' and public.ncs_can_access_evidence(entity_id))
);

-- Permit insertion of audit events by authenticated users so long as
-- they are the actor.  Admins may insert arbitrary events.  The
-- WITH CHECK clause enforces that non-admins cannot spoof the actor_id.
drop policy if exists ncs_audit_log_insert on public.ncs_audit_log;
create policy ncs_audit_log_insert on public.ncs_audit_log
for insert to authenticated
with check (
  public.ncs_is_admin()
  or actor_id = auth.uid()
);

commit;
