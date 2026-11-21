-- 0004 — Itens compostos: mapas de decisão (diálogo interativo) e casos (texto-base + 2 questões).
-- A correção só aparece no fim do conjunto/prova; as questões de múltipla escolha do conjunto ficam em `questions`
-- (scenario_code / scenario_pos) e seguem as mesmas regras de imutabilidade.

create table if not exists public.question_scenarios (
  code         text primary key,                                   -- ex.: '000140' (código do item no portal)
  cert         text not null check (cert in ('CPA','CPRO_R','CPRO_I')),
  kind         text not null check (kind in ('mapa','caso')),
  year         int  not null,
  topic        text,
  pd_code      text,
  difficulty   text,
  body         jsonb not null,                                      -- mapa: {intro,pergunta,rootKey,nodes}; caso: {html}
  source       text not null default 'anbima' check (source in ('anbima','ia')),
  status       text not null default 'publicada' check (status in ('publicada','revisao','arquivada')),
  content_hash text,
  created_at   timestamptz not null default now()
);

alter table public.questions
  add column if not exists scenario_code text references public.question_scenarios(code),
  add column if not exists scenario_pos  int;
create index if not exists questions_scenario_idx on public.questions (scenario_code, scenario_pos);

alter table public.question_scenarios enable row level security;
create policy "scenarios: leitura" on public.question_scenarios
  for select to authenticated using (status = 'publicada' or public.is_admin());

create or replace function public.scenario_set_hash() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.source <> 'anbima' then
    new.content_hash := encode(sha256(convert_to(new.kind || '|' || new.body::text, 'UTF8')), 'hex');
  end if;
  return new;
end $$;
drop trigger if exists scenarios_a_hash on public.question_scenarios;
create trigger scenarios_a_hash before insert or update on public.question_scenarios
  for each row execute function public.scenario_set_hash();

create or replace function public.scenarios_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.source = 'anbima' then
      raise exception 'Item da Anbima não pode ser apagado' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.source = 'anbima' and (
       (new.cert, new.kind, new.year, new.source, new.body, new.content_hash)
       is distinct from (old.cert, old.kind, old.year, old.source, old.body, old.content_hash)) then
    raise exception 'Item da Anbima é imutável' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists scenarios_b_guard on public.question_scenarios;
create trigger scenarios_b_guard before update or delete on public.question_scenarios
  for each row execute function public.scenarios_guard();

-- verify_integrity também confere os cenários.
create or replace function public.verify_scenarios_integrity() returns bigint language sql stable as $$
  select count(*) from public.question_scenarios
   where source = 'anbima'
     and content_hash is distinct from encode(sha256(convert_to(kind || '|' || body::text, 'UTF8')), 'hex')
$$;

-- O sorteio de múltipla escolha ignora as questões de conjunto.
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

-- Sorteia os conjuntos (mapas/casos) da prova: CPA 5 · C-Pro R 7 · C-Pro I 5 (2 questões de correção por conjunto).
-- Prioriza os não vistos na tentativa anterior; só conjuntos publicados e completos (2 questões publicadas).
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
     where s.cert = p_cert and s.status = 'publicada'
       and (select count(*) from public.questions q where q.scenario_code = s.code and q.status = 'publicada') = 2
  ),
  picked as (select code from ok order by was_seen, random() limit (select n from params))
  select code, (row_number() over (order by random()))::int from picked
$$;
grant execute on function public.generate_exam_scenarios(text, int) to authenticated;
