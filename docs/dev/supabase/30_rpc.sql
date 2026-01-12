-- 30_rpc.sql (sanitized) — Funções RPC para gestão de papéis e designação de avaliadores.
--
-- Este arquivo fornece funções de alto nível para o backend:
--   • `ncs_rpc_upsert_membership` — concede ou atualiza uma associação de usuário com papel (`admin`, `auditor` ou `client`).
--     Somente administradores podem executar esta função, garantindo que os papéis sejam atribuídos de forma controlada.
--   • `ncs_rpc_assign_auditors` — designa avaliador principal e revisor a um processo. Recria ou atualiza
--     entradas em `ncs_process_assignments`. Somente administradores podem chamar esta função para manter
--     a segregação de deveres entre operação/NCS e avaliadores.

--
-- ## Observações normativas
--
-- O Programa NCS impõe que apenas administradores possam criar e alterar atribuições de usuários e
-- designar avaliadores.  Assim, ambas as funções RPC (`ncs_rpc_upsert_membership` e `ncs_rpc_assign_auditors`)
-- verificam se o usuário que as invoca possui o papel de `admin` através da função `ncs_is_admin()`.
--  
-- As funções seguem as regras do Regulamento:
--   • Atribuição de papéis é gerenciada centralmente pela NCS; participantes e avaliadores não podem se
--     autodesignar ou autoelevar de papel.  
--   • A designação de Avaliador Principal e Revisor ocorre após a triagem formal e deve observar ausência
--     de conflito de interesses e assinatura de declarações de confidencialidade【99705417965440†L410-L415】.
begin;

create or replace function public.ncs_rpc_upsert_membership(
  p_user_id uuid,
  p_company_id uuid,
  p_role public.ncs_role,
  p_is_active boolean default true
)
returns public.ncs_memberships
language plpgsql security definer set search_path=public as $$
declare out_row public.ncs_memberships;
begin
  if not public.ncs_is_admin(auth.uid()) then raise exception 'not_admin'; end if;

  insert into public.ncs_memberships(company_id,user_id,role,is_active)
  values (p_company_id,p_user_id,p_role,p_is_active)
  on conflict (company_id,user_id,role)
  do update set is_active=excluded.is_active, updated_at=now()
  returning * into out_row;

  return out_row;
end;
$$;

create or replace function public.ncs_rpc_assign_auditors(
  p_process_id text,
  p_principal_id uuid,
  p_reviewer_id uuid
)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.ncs_is_admin(auth.uid()) then raise exception 'not_admin'; end if;

  insert into public.ncs_process_assignments(process_id,auditor_id,role,assigned_by)
  values (p_process_id,p_principal_id,'principal',auth.uid())
  on conflict (process_id,role)
  do update set auditor_id=excluded.auditor_id, assigned_by=excluded.assigned_by, assigned_at=now(), updated_at=now();

  insert into public.ncs_process_assignments(process_id,auditor_id,role,assigned_by)
  values (p_process_id,p_reviewer_id,'reviewer',auth.uid())
  on conflict (process_id,role)
  do update set auditor_id=excluded.auditor_id, assigned_by=excluded.assigned_by, assigned_at=now(), updated_at=now();
end;
$$;

commit;
