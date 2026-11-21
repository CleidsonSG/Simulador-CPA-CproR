# Simulador Anbima — CPA, C-Pro R e C-Pro I

Simulador de provas de certificação Anbima (CPA, C-Pro R e C-Pro I), com questões de **2026 em diante**.

## Regras da prova (Edital Anbima, rev. nov/2025)
- CPA: 50 questões, 2h30, aprovação com 70% (35 acertos).
- C-Pro R: 45 questões, 2h30, aprovação com 71% (32 acertos).
- C-Pro I: 40 questões, 2h30, aprovação com 70% (28 acertos).
- 4 alternativas, uma correta. Constantes em `src/lib/exam.ts`.
- Cada resposta mostra acerto/erro na hora; no erro, explica.

## Stack
Vite + React 18 + TypeScript, CSS próprio (mobile-first, modo escuro), Vitest.
Banco: Supabase (conta separada da do GitHub). Esquema em `supabase/migrations/0001_init.sql`.

## Comandos
- `npm install` · `npm run dev` · `npm test` · `npm run build`

## Regras importantes
- **Este repositório é PÚBLICO. Nunca commitar questões reais da Anbima** (nem em JSON, CSV, testes ou prints). Elas ficam só no Supabase. A pasta `data-private/` está no `.gitignore`.
- Nunca commitar senhas, chaves de serviço ou `.env`. No front só a URL e a chave pública (anon) do Supabase.
- As questões em `src/data/sampleQuestions.ts` são de exemplo, escritas para o projeto.
- Ponto único de dados: `src/data/source.ts` (`loadQuestions`). Trocar o conteúdo por consulta ao Supabase filtrando `year >= 2026`.

## Integridade, recursos e agentes
- Questões `source='anbima'` são imutáveis (trigger + hash) e mantêm a ordem original das alternativas; só a ordem das questões é sorteada (`buildExam` / SQL `generate_exam`, cotas 20/40/30/10 CPA, 20/20/40/20 C-Pro R e 40/15/25/20 C-Pro I).
- Recursos: tabela `appeals` → agente `.claude/agents/agente-recursos.md` (`/analisar-recursos`) → `record_decision`. ≥3 deferidos (confiança ≥0,7) de usuários distintos movem a questão para `questions_quarantine` (só admin; reversível com `restore_question`).
- Criador de questões: `.claude/agents/criador-questoes.md` → `insert_generated_question` (source='ia'; sem verificação fica em `revisao`).
- Validar SQL: `npm run test:sql` (PGlite). Texto integral dos PDFs do PD em `knowledge-private/` (fora do Git); links em `knowledge/FONTES.md`.

## Mapas de decisão e casos (migração 0004)
- Tabela `question_scenarios` (code, cert, kind `mapa`|`caso`, body jsonb, status). Mapa: `body = {intro, pergunta, rootKey, nodes}`; cada nó `{client, pergunta, options[4], next[{gerente, child}], end, endText}`. Caso: `body = {html}` (texto-base com tabelas).
- Cada conjunto tem 2 questões de múltipla escolha em `questions` (`scenario_code`, `scenario_pos` 1–2), com correção só no fim do conjunto/prova. As opções do mapa não têm gabarito; só as 2 questões finais valem.
- Já importados (source='anbima'): 8 mapas (CPA 5, C-Pro R 3) e 11 casos (C-Pro R 5, C-Pro I 6). Casos 000105 e 000175 ficam em `revisao` (gráficos em links que expiram; capturar as imagens antes de publicar).
- `generate_exam` agora ignora questões de conjunto; `generate_exam_scenarios(cert)` sorteia os conjuntos (CPA 5, C-Pro R 7, C-Pro I 5). Prova = MC + 2 questões por conjunto.
- O portal mostra o gabarito sempre na alternativa A nos itens de conjunto: embaralhar só a exibição (nunca o banco).
- Faltam 3 questões MC da C-Pro I (000080, 000081 e mais 1) para importar.

## Visual (diretrizes do projeto)
Mobile-first (360–1440 px), modo escuro, esqueleto de carregamento, estados vazio/erro/sem internet, acessibilidade (não depender só de cor). Conferir em celular e computador antes de entregar tela.

## Próximos passos
0. Tela do mapa (conversa com atraso de digitação e botão voltar), tela do caso, `buildExam` com conjuntos como blocos contíguos, correção só no fim, revisão no resultado; amostras originais no repo (nunca dados reais); testes; conferir em 390 e 1280 px.
1. Ligar o Supabase (URL + anon key em `.env`, criar `src/lib/supabase.ts`).
2. Login (Supabase Auth) e salvar tentativas em `attempts` / `attempt_answers`.
3. Importar as questões reais (script local, chave de serviço, fora do Git).
4. Questões de caso e árvore de decisão da C-Pro R (formato interativo).
5. Gráfico de evolução do desempenho e modo "refazer só os erros".
