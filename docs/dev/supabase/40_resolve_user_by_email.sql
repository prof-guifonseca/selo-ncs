-- 40_resolve_user_by_email.sql — Função RPC para resolução de usuários por email
--
-- Esta função auxilia o painel administrativo a localizar rapidamente um
-- usuário no sistema de autenticação (auth.users) a partir do seu email.
-- Como a API REST do Supabase não expõe um endpoint estável para
-- `getUserByEmail` via chave anon, esta RPC controlada via service role
-- consulta a tabela `auth.users` diretamente.  A função retorna o
-- `user_id` (UUID) e o `email` normalizado para o primeiro registro
-- correspondente ao email informado (caso-insensível).
--
-- Segurança:
-- - A função é `SECURITY DEFINER` e define explicitamente o search_path
--   como `public, auth` para restringir o escopo de objetos acessíveis.
-- - As permissões de execução são revogadas de `PUBLIC` e concedidas
--   apenas ao papel `service_role`, garantindo que apenas o backend
--   trusteado possa invocá-la.

begin;

create or replace function public.ncs_resolve_user_by_email(p_email text)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Normaliza e valida o email de entrada.  Emails vazios resultam em
  -- retorno nulo sem lançar exceção.
  if coalesce(trim(p_email), '') = '' then
    return;
  end if;

  -- Consulta a tabela auth.users (somente campos id e email) usando
  -- comparação case-insensitive.  O limite de 1 garante previsibilidade
  -- quando múltiplos registros compartilharem o mesmo email (situação
  -- indesejada, mas defensiva).
  return query
    select u.id as user_id, u.email
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1;
end;
$$;

-- Restringe a execução da RPC: revoga permissões de todos e concede
-- apenas ao papel service_role.  Usuários anon ou autenticados via
-- JWT não podem chamar esta função diretamente.
revoke all on function public.ncs_resolve_user_by_email(text) from public;
grant execute on function public.ncs_resolve_user_by_email(text) to service_role;

commit;