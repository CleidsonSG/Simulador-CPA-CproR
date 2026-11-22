-- 0008 — Limpar o próprio histórico e excluir contas pelo painel.
-- Rodar DEPOIS da 0007, no SQL Editor. Não contém nenhuma questão.
--
--  - clear_my_history(): o aluno apaga os PRÓPRIOS simulados (attempts; as respostas caem junto,
--    on delete cascade). Recursos já enviados ficam (são análise das questões, não histórico).
--  - Exclusão de conta: feita pela Edge Function admin-usuarios (acao 'excluir_conta'), que precisa
--    ler o perfil com a chave de serviço para não apagar o último administrador.

create or replace function public.clear_my_history() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Faça login novamente' using errcode = '42501'; end if;
  delete from public.attempts where user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.clear_my_history() from public, anon;
grant execute on function public.clear_my_history() to authenticated;

-- Edge Function (chave de serviço) confere papel/situação antes de excluir uma conta.
grant select on public.profiles to service_role;
