-- 0007 — Perfis, aprovação de acesso e painel de administração.
-- Rodar DEPOIS da 0006, no SQL Editor. Não contém nenhuma questão.
--
--  - Cada conta tem um perfil: situação (pendente | aprovado | bloqueado) e papel (aluno | admin).
--  - Só conta APROVADA lê questões/conjuntos e grava tentativas e recursos (RLS).
--  - Conta nova fica pendente, a menos que o admin ligue "aprovar automaticamente" (app_settings).
--  - Convite feito pelo admin (Edge Function admin-usuarios) já entra aprovado, com o papel escolhido.
--  - Quem é admin passa a ser definido pelo perfil (papel admin + aprovado). As contas já existentes
--    são migradas: quem está em app_admins vira admin; as demais ficam aprovadas como aluno.

-- ───────────── 1. Tabela de perfis ─────────────
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  status      text not null default 'pendente' check (status in ('pendente', 'aprovado', 'bloqueado')),
  role        text not null default 'aluno'    check (role in ('aluno', 'admin')),
  invited     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid
);
alter table public.profiles enable row level security;

insert into public.app_settings (key, value) values ('cadastro_auto_aprovar', 0) on conflict (key) do nothing;

-- ───────────── 2. Quem é admin / quem está aprovado ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.user_id = auth.uid() and p.role = 'admin' and p.status = 'aprovado')
      or coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.status = 'aprovado')
      or coalesce(auth.role(), '') = 'service_role'
$$;

-- ───────────── 3. Perfil criado junto com a conta ─────────────
-- Convite: só é confiável quando o próprio Auth marcou invited_at (ninguém consegue isso pelo cadastro comum).
-- O papel do convite vem de raw_user_meta_data.convite_perfil, gravado pela Edge Function (só admin convida).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_invite boolean := new.invited_at is not null;
  inv_role  text := case when new.invited_at is not null and new.raw_user_meta_data ->> 'convite_perfil' = 'admin'
                         then 'admin' else 'aluno' end;
  auto      boolean := coalesce((select value from public.app_settings where key = 'cadastro_auto_aprovar'), 0) = 1;
begin
  insert into public.profiles (user_id, email, full_name, status, role, invited)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''),
          case when is_invite or auto then 'aprovado' else 'pendente' end,
          inv_role, is_invite)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- E-mail atualizado no Auth → atualiza o perfil.
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email, updated_at = now() where user_id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.handle_user_email();

-- Contas que já existiam: admin quem está em app_admins; os demais, aluno aprovado.
insert into public.profiles (user_id, email, status, role, invited, decided_at)
select u.id, u.email, 'aprovado',
       case when exists (select 1 from public.app_admins a where a.user_id = u.id) then 'admin' else 'aluno' end,
       u.invited_at is not null, now()
  from auth.users u
on conflict (user_id) do nothing;

-- ───────────── 4. RLS: só conta aprovada usa o banco real ─────────────
create policy "profiles: dono ou admin lê" on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Sem policy de insert/update/delete: perfil só muda pelas funções abaixo.

drop policy if exists "questions: leitura" on public.questions;
create policy "questions: leitura" on public.questions
  for select to authenticated using ((status = 'publicada' and public.is_approved()) or public.is_admin());

drop policy if exists "scenarios: leitura" on public.question_scenarios;
create policy "scenarios: leitura" on public.question_scenarios
  for select to authenticated using ((status = 'publicada' and public.is_approved()) or public.is_admin());

drop policy if exists "attempts: dono cria" on public.attempts;
create policy "attempts: dono cria" on public.attempts
  for insert to authenticated with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "answers: dono cria" on public.attempt_answers;
create policy "answers: dono cria" on public.attempt_answers
  for insert to authenticated with check (
    public.is_approved() and exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));

drop policy if exists "appeals: dono cria" on public.appeals;
create policy "appeals: dono cria" on public.appeals
  for insert to authenticated with check (user_id = auth.uid() and public.is_approved());

-- ───────────── 5. Funções do painel (todas conferem is_admin) ─────────────
create or replace function public.admin_list_users()
returns table (user_id uuid, email text, full_name text, status text, role text, invited boolean,
               created_at timestamptz, decided_at timestamptz, confirmed boolean, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  return query
    select p.user_id, coalesce(u.email, p.email)::text, p.full_name, p.status, p.role, p.invited,
           p.created_at, p.decided_at, (u.email_confirmed_at is not null), u.last_sign_in_at
      from public.profiles p left join auth.users u on u.id = p.user_id
     order by (p.status = 'pendente') desc, p.created_at desc;
end $$;

-- Muda situação e/ou papel. Protege contra o admin se trancar para fora e contra ficar sem nenhum admin.
create or replace function public.admin_set_user(p_user uuid, p_status text default null, p_role text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cur public.profiles; admins int;
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('pendente', 'aprovado', 'bloqueado') then raise exception 'Situação inválida'; end if;
  if p_role is not null and p_role not in ('aluno', 'admin') then raise exception 'Perfil inválido'; end if;
  select * into cur from public.profiles where user_id = p_user for update;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if p_user = auth.uid() and ((p_status is not null and p_status <> 'aprovado') or (p_role is not null and p_role <> 'admin')) then
    raise exception 'Você não pode bloquear nem rebaixar a própria conta';
  end if;
  if cur.role = 'admin' and cur.status = 'aprovado'
     and ((p_status is not null and p_status <> 'aprovado') or (p_role is not null and p_role <> 'admin')) then
    select count(*) into admins from public.profiles where role = 'admin' and status = 'aprovado';
    if admins <= 1 then raise exception 'É preciso manter pelo menos um administrador'; end if;
  end if;
  update public.profiles
     set status = coalesce(p_status, status), role = coalesce(p_role, role),
         updated_at = now(), decided_at = now(), decided_by = auth.uid()
   where user_id = p_user;
end $$;

-- Configuração do cadastro: aprovar automaticamente (true) ou deixar pendente (false).
create or replace function public.admin_get_signup_auto() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  return coalesce((select value from public.app_settings where key = 'cadastro_auto_aprovar'), 0) = 1;
end $$;

create or replace function public.admin_set_signup_auto(p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  insert into public.app_settings (key, value) values ('cadastro_auto_aprovar', case when p_auto then 1 else 0 end)
    on conflict (key) do update set value = excluded.value;
end $$;

-- ───────────── 6. Permissões (projeto novo do Supabase não concede nada sozinho) ─────────────
grant select on public.profiles to authenticated;
revoke execute on function public.admin_list_users(), public.admin_set_user(uuid, text, text),
  public.admin_get_signup_auto(), public.admin_set_signup_auto(boolean),
  public.handle_new_user(), public.handle_user_email() from public, anon;
grant execute on function public.admin_list_users(), public.admin_set_user(uuid, text, text),
  public.admin_get_signup_auto(), public.admin_set_signup_auto(boolean),
  public.is_admin(), public.is_approved() to authenticated;
grant execute on function public.admin_list_users(), public.admin_set_user(uuid, text, text),
  public.admin_get_signup_auto(), public.admin_set_signup_auto(boolean), public.is_admin() to service_role;
