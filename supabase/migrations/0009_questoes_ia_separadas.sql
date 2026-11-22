-- 0009 · Questões criadas por IA ficam SEPARADAS das questões oficiais da Anbima.
-- Regra do projeto: questão de IA nunca entra no simulado nem se mistura às oficiais.
--  1. Tabela própria (training_questions), usada só pelo Treino focado.
--  2. A tabela oficial (questions) passa a recusar questão de IA ativa (constraint).
--  3. Questões de IA que já estivessem na tabela oficial são arquivadas (saem de tudo; nada é apagado,
--     para não quebrar tentativas e recursos antigos que apontam para elas).
--  4. O sorteio do simulado (generate_exam / generate_exam_scenarios) aceita só source = 'anbima'.
--  5. insert_generated_question passa a gravar na tabela de treino, sempre em revisão;
--     só o administrador publica (publish_training_question).

-- ───────────── 1. Tabela das questões de treino (IA) ─────────────
create table if not exists public.training_questions (
  id            uuid primary key default gen_random_uuid(),
  cert          text not null check (cert in ('CPA', 'CPRO_R', 'CPRO_I')),
  pd_code       text,
  topic         text not null,
  difficulty    text not null check (difficulty in ('Baixa', 'Média', 'Alta')),
  statement     text not null,
  options       jsonb not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation   text not null,
  status        text not null default 'revisao' check (status in ('revisao', 'publicada', 'rejeitada')),
  generated_by  text not null default 'agente',
  reviewed_by   text,
  review_notes  text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint training_options_is_array check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4)
);
create index if not exists training_questions_cert_idx on public.training_questions (cert, status);

alter table public.training_questions enable row level security;
drop policy if exists "training: leitura" on public.training_questions;
create policy "training: leitura" on public.training_questions
  for select to authenticated using ((status = 'publicada' and public.is_approved()) or public.is_admin());
-- Sem policy de escrita: só as funções abaixo (security definer, admin) gravam.
grant select on public.training_questions to authenticated;

-- ───────────── 2 e 3. Tabela oficial sem questões de IA ─────────────
-- O guard de imutabilidade protege só source='anbima'; arquivar as de IA é permitido.
update public.questions set status = 'arquivada' where source = 'ia' and status <> 'arquivada';
alter table public.questions drop constraint if exists questions_sem_ia_ativa;
alter table public.questions add constraint questions_sem_ia_ativa check (source <> 'ia' or status = 'arquivada');

-- ───────────── 4. Simulado: só questões oficiais ─────────────
create or replace function public.generate_exam(p_cert text, p_size int default null)
returns table (question_id uuid, pos int)
language sql volatile set search_path = public as $$
  with params as (
    select coalesce(p_size, case p_cert when 'CPA' then 50 when 'CPRO_I' then 40 else 45 end) as n
  ),
  last_attempt as (
    select id from public.attempts where user_id = auth.uid() and cert = p_cert order by started_at desc limit 1
  ),
  seen as (
    select aa.question_id from public.attempt_answers aa join last_attempt l on l.id = aa.attempt_id
  ),
  cand as (
    select q.id, q.topic,
           coalesce(nullif(split_part(q.pd_code, '.', 1), '')::int, 0) as macro,
           (q.id in (select question_id from seen)) as was_seen
      from public.questions q
     where q.cert = p_cert and q.status = 'publicada' and q.scenario_code is null
       and q.source = 'anbima'
  ),
  ranked_topic as (
    select c.*, row_number() over (partition by c.macro, c.topic order by c.was_seen, random()) as rt,
           count(*) over (partition by c.macro, c.topic) as nt
      from cand c
  ),
  ranked_macro as (
    select r.*, row_number() over (partition by r.macro order by r.was_seen, (r.rt - random()) / r.nt) as rm
      from ranked_topic r
  ),
  keyed as (
    select r.id, (r.rm - random()) / (p.n * coalesce(b.share, 0.25)) as k
      from ranked_macro r
      cross join params p
      left join public.exam_blueprint b on b.cert = p_cert and b.macro = r.macro
  ),
  picked as (select id from keyed order by k limit (select n from params))
  select id, (row_number() over (order by random()))::int from picked
$$;

create or replace function public.generate_exam_scenarios(p_cert text, p_sets int default null)
returns table (scenario_code text, pos int)
language sql volatile set search_path = public as $$
  with params as (select coalesce(p_sets, case p_cert when 'CPA' then 5 when 'CPRO_R' then 7 else 5 end) as n),
  last_attempt as (
    select id from public.attempts where user_id = auth.uid() and cert = p_cert order by started_at desc limit 1
  ),
  seen as (
    select distinct q.scenario_code from public.attempt_answers aa
      join last_attempt l on l.id = aa.attempt_id
      join public.questions q on q.id = aa.question_id
     where q.scenario_code is not null
  ),
  ok as (
    select s.code, (s.code in (select scenario_code from seen)) as was_seen
      from public.question_scenarios s
     where s.cert = p_cert and s.status = 'publicada' and s.source = 'anbima'
       and (select count(*) from public.questions q
             where q.scenario_code = s.code and q.status = 'publicada' and q.source = 'anbima') = 2
  ),
  picked as (select code from ok order by was_seen, random() limit (select n from params))
  select code, (row_number() over (order by random()))::int from picked
$$;
grant execute on function public.generate_exam(text, int) to authenticated;
grant execute on function public.generate_exam_scenarios(text, int) to authenticated;

-- ───────────── 5. Criação e publicação das questões de treino ─────────────
-- Mesma assinatura de antes (agentes antigos continuam funcionando), mas grava na tabela de treino
-- e SEMPRE em revisão: p_verified só registra que o revisor independente aprovou.
create or replace function public.insert_generated_question(
  p_cert text, p_pd_code text, p_topic text, p_difficulty text, p_statement text,
  p_options jsonb, p_correct_index int, p_explanation text, p_generated_by text, p_verified boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then
    raise exception 'A questão precisa de exatamente 4 alternativas';
  end if;
  if (select count(distinct lower(btrim(x))) from jsonb_array_elements_text(p_options) x) <> 4
     or exists (select 1 from jsonb_array_elements_text(p_options) x where btrim(x) = '') then
    raise exception 'Alternativas vazias ou repetidas';
  end if;
  if p_correct_index not between 0 and 3 then raise exception 'Gabarito inválido'; end if;
  if coalesce(btrim(p_explanation), '') = '' then raise exception 'Explicação obrigatória'; end if;
  -- Nada parecido com uma questão oficial nem repetido no treino.
  if exists (select 1 from public.questions where lower(btrim(statement)) = lower(btrim(p_statement)))
     or exists (select 1 from public.questions_quarantine where lower(btrim(snapshot ->> 'statement')) = lower(btrim(p_statement)))
     or exists (select 1 from public.training_questions where lower(btrim(statement)) = lower(btrim(p_statement))) then
    raise exception 'Enunciado duplicado';
  end if;
  insert into public.training_questions (cert, pd_code, topic, difficulty, statement, options, correct_index,
                                         explanation, status, generated_by, reviewed_by)
  values (p_cert, p_pd_code, p_topic, p_difficulty, p_statement, p_options, p_correct_index, p_explanation,
          'revisao', coalesce(p_generated_by, 'agente'), case when p_verified then 'revisor-independente' end)
  returning id into new_id;
  return new_id;
end $$;

-- Publica (true) ou rejeita (false) uma questão de treino. Só o administrador.
create or replace function public.publish_training_question(p_id uuid, p_publish boolean, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  update public.training_questions
     set status = case when p_publish then 'publicada' else 'rejeitada' end,
         published_at = case when p_publish then now() end,
         review_notes = coalesce(p_notes, review_notes)
   where id = p_id;
  if not found then raise exception 'Questão de treino não encontrada'; end if;
end $$;

revoke execute on function public.insert_generated_question(text, text, text, text, text, jsonb, int, text, text, boolean),
  public.publish_training_question(uuid, boolean, text) from public, anon;
grant execute on function public.insert_generated_question(text, text, text, text, text, jsonb, int, text, text, boolean),
  public.publish_training_question(uuid, boolean, text) to authenticated;
