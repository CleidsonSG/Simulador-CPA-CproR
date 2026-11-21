-- Simulador CPA / C-Pro R — esquema inicial
-- Rodar no SQL Editor do Supabase (ou via CLI). Não contém nenhuma questão.
-- As questões reais são importadas à parte, por chave de serviço, e nunca vão para o GitHub.

create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  source_code   text unique,                       -- código da questão no banco de origem (ex.: 000085)
  cert          text not null check (cert in ('CPA', 'CPRO_R')),
  topic         text not null,                     -- tópico do programa detalhado (PD)
  pd_code       text,
  difficulty    text not null check (difficulty in ('Baixa', 'Média', 'Alta')),
  format        text not null default 'multipla_escolha',
  year          int  not null check (year >= 2026),-- só questões de 2026 em diante
  statement     text not null,
  options       jsonb not null,                    -- ["A...", "B...", "C...", "D..."]
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation   text,
  created_at    timestamptz not null default now(),
  constraint options_is_array check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4)
);
create index if not exists questions_cert_idx on public.questions (cert, year);

create table if not exists public.attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cert         text not null check (cert in ('CPA', 'CPRO_R')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  used_seconds int,
  correct      int not null default 0,
  total        int not null,
  pass_mark    int not null,
  passed       boolean
);
create index if not exists attempts_user_idx on public.attempts (user_id, started_at desc);

create table if not exists public.attempt_answers (
  attempt_id   uuid not null references public.attempts (id) on delete cascade,
  question_id  uuid not null references public.questions (id),
  chosen_index smallint check (chosen_index between 0 and 3),
  is_correct   boolean not null,
  primary key (attempt_id, question_id)
);

-- Segurança: tudo com RLS. Questões só para quem está logado; tentativas só do próprio usuário.
alter table public.questions       enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;

create policy "questions: leitura para logados" on public.questions
  for select to authenticated using (true);
-- Sem policy de insert/update/delete em questions: a importação usa a chave de serviço.

create policy "attempts: dono lê" on public.attempts
  for select to authenticated using (user_id = auth.uid());
create policy "attempts: dono cria" on public.attempts
  for insert to authenticated with check (user_id = auth.uid());
create policy "attempts: dono atualiza" on public.attempts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "answers: dono lê" on public.attempt_answers
  for select to authenticated using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));
create policy "answers: dono cria" on public.attempt_answers
  for insert to authenticated with check (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));
