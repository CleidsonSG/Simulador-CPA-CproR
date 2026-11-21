-- 0002 — Autenticidade das questões, recursos, quarentena (só admin) e sorteio da prova.
-- Rodar DEPOIS de 0001_init.sql, no SQL Editor do Supabase. Não contém nenhuma questão.

-- ───────────── 1. Origem e integridade das questões ─────────────
alter table public.questions
  add column if not exists source             text not null default 'anbima' check (source in ('anbima', 'ia', 'exemplo')),
  add column if not exists status             text not null default 'publicada' check (status in ('publicada', 'revisao', 'arquivada')),
  add column if not exists explanation_source text check (explanation_source in ('anbima', 'ia')),
  add column if not exists content_hash       text,
  add column if not exists generated_by       text,
  add column if not exists verified_by        text;

-- O histórico de respostas deve sobreviver à retirada de uma questão (quarentena).
alter table public.attempt_answers drop constraint if exists attempt_answers_question_id_fkey;

-- Administradores: ninguém lê esta tabela pela API; quem edita é o dono do projeto (SQL Editor).
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid())
      or coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.question_hash(p_statement text, p_options jsonb, p_correct int) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_statement || '|' || p_options::text || '|' || p_correct::text, 'UTF8')), 'hex')
$$;

-- Carimbo de integridade (hash do enunciado + alternativas + gabarito), gravado na inserção.
create or replace function public.questions_set_hash() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.source <> 'anbima' then
    new.content_hash := public.question_hash(new.statement, new.options, new.correct_index);
  end if;
  return new;
end $$;
drop trigger if exists questions_a_hash on public.questions;
create trigger questions_a_hash before insert or update on public.questions
  for each row execute function public.questions_set_hash();

-- Questão da Anbima é IMUTÁVEL: texto, alternativas e gabarito nunca mudam, e ela só sai do banco pela quarentena.
create or replace function public.questions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.source = 'anbima' and coalesce(current_setting('app.allow_quarantine', true), '') <> 'on' then
      raise exception 'Questão da Anbima não pode ser apagada (use quarantine_question)' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.source = 'anbima' then
    if (new.cert, new.year, new.source, new.source_code, new.pd_code, new.topic, new.difficulty, new.format,
        new.statement, new.options, new.correct_index)
       is distinct from
       (old.cert, old.year, old.source, old.source_code, old.pd_code, old.topic, old.difficulty, old.format,
        old.statement, old.options, old.correct_index)
       or new.content_hash is distinct from old.content_hash then
      raise exception 'Questão da Anbima é imutável: enunciado, alternativas e gabarito não podem ser alterados' using errcode = '42501';
    end if;
    if old.explanation_source = 'anbima' and new.explanation is distinct from old.explanation then
      raise exception 'A explicação original da Anbima é imutável' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists questions_b_guard on public.questions;
create trigger questions_b_guard before update or delete on public.questions
  for each row execute function public.questions_guard();

-- Auditoria: devolve as questões cujo conteúdo não bate mais com o carimbo.
create or replace function public.verify_integrity() returns table (question_id uuid)
language sql stable as $$
  select id from public.questions
  where content_hash is distinct from public.question_hash(statement, options, correct_index)
$$;

-- Aluno só enxerga questões publicadas; admin enxerga todas.
drop policy if exists "questions: leitura para logados" on public.questions;
create policy "questions: leitura" on public.questions
  for select to authenticated using (status = 'publicada' or public.is_admin());

-- ───────────── 2. Recursos (contestações) ─────────────
create table if not exists public.appeals (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null,
  cert         text not null check (cert in ('CPA', 'CPRO_R')),
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  category     text not null check (category in
                 ('gabarito_incorreto', 'enunciado_ambiguo', 'mais_de_uma_correta', 'nenhuma_correta',
                  'fora_do_programa', 'desatualizada', 'outro')),
  argument     text not null check (char_length(argument) between 20 and 2000),
  chosen_index smallint check (chosen_index between 0 and 3),
  status       text not null default 'pendente' check (status in ('pendente', 'deferido', 'indeferido', 'inconclusivo')),
  created_at   timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists appeals_status_idx on public.appeals (status, created_at);
create index if not exists appeals_question_idx on public.appeals (question_id);

create table if not exists public.appeal_decisions (
  id          uuid primary key default gen_random_uuid(),
  appeal_id   uuid not null references public.appeals (id) on delete cascade,
  decision    text not null check (decision in ('deferido', 'indeferido', 'inconclusivo')),
  confidence  numeric not null check (confidence between 0 and 1),
  rationale   text not null,
  pd_refs     text[] not null default '{}',
  sources     jsonb not null default '[]',
  decided_by  text not null default 'agente' check (decided_by in ('agente', 'admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.app_settings (key text primary key, value numeric not null);
insert into public.app_settings (key, value) values ('recurso_limiar', 3), ('recurso_confianca', 0.7)
  on conflict (key) do nothing;

alter table public.appeals          enable row level security;
alter table public.appeal_decisions enable row level security;
alter table public.app_settings     enable row level security;

create policy "appeals: dono cria" on public.appeals
  for insert to authenticated with check (user_id = auth.uid());
create policy "appeals: dono ou admin lê" on public.appeals
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "decisions: dono ou admin lê" on public.appeal_decisions
  for select to authenticated using (
    public.is_admin() or exists (select 1 from public.appeals a where a.id = appeal_id and a.user_id = auth.uid()));
create policy "settings: admin lê" on public.app_settings
  for select to authenticated using (public.is_admin());
-- Decisões só entram por record_decision() (abaixo): não há policy de insert/update.

-- ───────────── 3. Quarentena: local onde SÓ o administrador acessa ─────────────
create table if not exists public.questions_quarantine (
  question_id       uuid primary key,
  snapshot          jsonb not null,           -- cópia fiel da linha original
  reason            text not null,
  appeals_deferidos int not null default 0,
  quarantined_at    timestamptz not null default now(),
  quarantined_by    uuid,
  restored_at       timestamptz
);
alter table public.questions_quarantine enable row level security;
create policy "quarentena: só admin" on public.questions_quarantine
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.questions_quarantine from anon;

create or replace function public.quarantine_question(p_question_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare q public.questions; n int;
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  select * into q from public.questions where id = p_question_id for update;
  if not found then return; end if;
  select count(*) into n from public.appeals where question_id = p_question_id and status = 'deferido';
  insert into public.questions_quarantine (question_id, snapshot, reason, appeals_deferidos, quarantined_by)
    values (q.id, to_jsonb(q), p_reason, n, auth.uid())
    on conflict (question_id) do update
      set snapshot = excluded.snapshot, reason = excluded.reason, appeals_deferidos = excluded.appeals_deferidos,
          quarantined_at = now(), restored_at = null;
  perform set_config('app.allow_quarantine', 'on', true);
  delete from public.questions where id = q.id;
  perform set_config('app.allow_quarantine', 'off', true);
end $$;

create or replace function public.restore_question(p_question_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare snap jsonb;
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  select snapshot into snap from public.questions_quarantine where question_id = p_question_id and restored_at is null;
  if snap is null then raise exception 'Questão não está em quarentena'; end if;
  insert into public.questions select * from jsonb_populate_record(null::public.questions, snap);
  update public.questions_quarantine set restored_at = now() where question_id = p_question_id;
end $$;

-- Registra a decisão do agente (ou do admin) e aplica a regra de quarentena:
-- N recursos DEFERIDOS, de usuários diferentes, cada um com confiança >= mínima, retiram a questão da prova.
create or replace function public.record_decision(
  p_appeal_id uuid, p_decision text, p_confidence numeric, p_rationale text,
  p_pd_refs text[] default '{}', p_sources jsonb default '[]', p_decided_by text default 'agente'
) returns text
language plpgsql security definer set search_path = public as $$
declare a public.appeals; limiar numeric; minconf numeric; n int;
begin
  if not public.is_admin() then raise exception 'Apenas administrador' using errcode = '42501'; end if;
  select * into a from public.appeals where id = p_appeal_id for update;
  if not found then raise exception 'Recurso não encontrado'; end if;
  insert into public.appeal_decisions (appeal_id, decision, confidence, rationale, pd_refs, sources, decided_by)
    values (p_appeal_id, p_decision, p_confidence, p_rationale, p_pd_refs, p_sources, p_decided_by);
  update public.appeals set status = p_decision where id = p_appeal_id;

  if p_decision = 'deferido' then
    select value into limiar  from public.app_settings where key = 'recurso_limiar';
    select value into minconf from public.app_settings where key = 'recurso_confianca';
    select count(distinct ap.user_id) into n
      from public.appeals ap
      join lateral (select d.confidence from public.appeal_decisions d
                    where d.appeal_id = ap.id order by d.created_at desc limit 1) last on true
     where ap.question_id = a.question_id and ap.status = 'deferido' and last.confidence >= minconf;
    if n >= limiar then
      perform public.quarantine_question(a.question_id,
        format('%s recursos deferidos de usuários diferentes (confiança >= %s)', n, minconf));
      return 'quarentena';
    end if;
  end if;
  return 'mantida';
end $$;

-- ───────────── 4. Sorteio da prova ─────────────
create table if not exists public.exam_blueprint (
  cert text not null check (cert in ('CPA', 'CPRO_R')),
  macro int not null check (macro between 1 and 4),
  share numeric not null check (share > 0 and share <= 1),
  primary key (cert, macro)
);
-- Proporções oficiais do Programa Detalhado (vigência 01/01/2026).
insert into public.exam_blueprint (cert, macro, share) values
  ('CPA', 1, 0.20), ('CPA', 2, 0.40), ('CPA', 3, 0.30), ('CPA', 4, 0.10),
  ('CPRO_R', 1, 0.20), ('CPRO_R', 2, 0.20), ('CPRO_R', 3, 0.40), ('CPRO_R', 4, 0.20)
  on conflict (cert, macro) do nothing;
alter table public.exam_blueprint enable row level security;
create policy "blueprint: leitura" on public.exam_blueprint for select to authenticated using (true);

-- Sorteia a prova do usuário: cotas por macrotema = proporção oficial; temas misturados;
-- questões da última tentativa dele ficam por último; a ordem devolvida é aleatória.
-- Todos os usuários recebem provas com a mesma "cara", mas nunca iguais entre tentativas.
create or replace function public.generate_exam(p_cert text, p_size int default null)
returns table (question_id uuid, pos int)
language sql volatile set search_path = public as $$
  with params as (
    select coalesce(p_size, case when p_cert = 'CPA' then 50 else 45 end) as n
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
     where q.cert = p_cert and q.status = 'publicada'
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

-- ───────────── 5. Questões criadas pelo agente criador ─────────────
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
  if exists (select 1 from public.questions where lower(btrim(statement)) = lower(btrim(p_statement)))
     or exists (select 1 from public.questions_quarantine where lower(btrim(snapshot ->> 'statement')) = lower(btrim(p_statement))) then
    raise exception 'Enunciado duplicado';
  end if;
  insert into public.questions (cert, pd_code, topic, difficulty, year, statement, options, correct_index,
                                explanation, source, explanation_source, status, generated_by, verified_by)
  values (p_cert, p_pd_code, p_topic, p_difficulty, greatest(2026, extract(year from now())::int), p_statement,
          p_options, p_correct_index, p_explanation, 'ia', 'ia',
          case when p_verified then 'publicada' else 'revisao' end, p_generated_by,
          case when p_verified then 'verificador-independente' end)
  returning id into new_id;
  return new_id;
end $$;

-- Execução: só usuários logados; as funções administrativas se protegem com is_admin().
revoke execute on function public.quarantine_question(uuid, text), public.restore_question(uuid),
  public.record_decision(uuid, text, numeric, text, text[], jsonb, text),
  public.insert_generated_question(text, text, text, text, text, jsonb, int, text, text, boolean) from public, anon;
grant execute on function public.generate_exam(text, int) to authenticated;
