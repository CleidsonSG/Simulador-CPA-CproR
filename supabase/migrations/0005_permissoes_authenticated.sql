-- 0005 — Permissões das tabelas para usuários logados (papel `authenticated`).
-- Projetos novos do Supabase não concedem acesso automático às tabelas criadas por SQL: sem estes GRANTs a API
-- responde "permission denied" mesmo com RLS correto. O RLS continua decidindo QUAIS linhas cada um vê/grava.
-- `anon` (sem login) não recebe nada.

grant usage on schema public to authenticated;

-- Leitura (o RLS restringe: questões só publicadas, tentativas só do próprio usuário etc.)
grant select on public.questions, public.question_scenarios, public.exam_blueprint,
                public.attempts, public.attempt_answers, public.appeals, public.appeal_decisions
  to authenticated;

-- Gravação do aluno (as policies de insert/update limitam ao próprio user_id)
grant insert on public.attempts, public.attempt_answers, public.appeals to authenticated;
grant update on public.attempts to authenticated;

-- Funções chamadas pelo app
grant execute on function public.generate_exam(text, int) to authenticated;
grant execute on function public.generate_exam_scenarios(text, int) to authenticated;
