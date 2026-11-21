-- 0003 — Classificação (código do PD, tópico, dificuldade) pode ser corrigida; texto, alternativas e gabarito continuam imutáveis.
create or replace function public.questions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.source = 'anbima' and coalesce(current_setting('app.allow_quarantine', true), '') <> 'on' then
      raise exception 'Questão da Anbima não pode ser apagada (use quarantine_question)' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.source = 'anbima' then
    if (new.cert, new.year, new.source, new.source_code, new.format, new.statement, new.options, new.correct_index)
       is distinct from
       (old.cert, old.year, old.source, old.source_code, old.format, old.statement, old.options, old.correct_index)
       or new.content_hash is distinct from old.content_hash then
      raise exception 'Questão da Anbima é imutável: enunciado, alternativas e gabarito não podem ser alterados' using errcode = '42501';
    end if;
    if old.explanation_source = 'anbima' and new.explanation is distinct from old.explanation then
      raise exception 'A explicação original da Anbima é imutável' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
