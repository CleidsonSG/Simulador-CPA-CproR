-- 0006 — Permissões que faltavam (encontradas pelo test:sql sem GRANT automático, como num projeto novo do Supabase).
-- Rodar DEPOIS da 0005. Só concede o mínimo; o RLS e as próprias funções continuam decidindo quem pode o quê.

-- 1. Funções administrativas: a 0002 tirou o EXECUTE de public/anon, mas nunca deu a `authenticated`.
--    Sem isto, nem o admin logado consegue registrar decisão, pôr/tirar da quarentena ou inserir questão gerada.
--    Cada função confere public.is_admin() e recusa quem não é admin; anon continua sem acesso.
grant execute on function
  public.record_decision(uuid, text, numeric, text, text[], jsonb, text),
  public.quarantine_question(uuid, text),
  public.restore_question(uuid),
  public.insert_generated_question(text, text, text, text, text, jsonb, int, text, text, boolean)
  to authenticated;

-- 2. Quarentena: o admin precisa ler pela API. A policy "quarentena: só admin" (is_admin) filtra as linhas;
--    para os demais a consulta volta vazia. Gravação só pelas funções (security definer).
grant select on public.questions_quarantine to authenticated;

-- 3. Script de importação (scripts/import-questions.mjs, chave de serviço = papel service_role).
--    Lê os códigos já existentes e insere só os novos (ON CONFLICT DO NOTHING: não precisa de UPDATE/DELETE).
grant usage on schema public to service_role;
grant select, insert on public.questions, public.question_scenarios to service_role;
