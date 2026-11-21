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

## Visual (diretrizes do projeto)
Mobile-first (360–1440 px), modo escuro, esqueleto de carregamento, estados vazio/erro/sem internet, acessibilidade (não depender só de cor). Conferir em celular e computador antes de entregar tela.

## Próximos passos
1. Ligar o Supabase (URL + anon key em `.env`, criar `src/lib/supabase.ts`).
2. Login (Supabase Auth) e salvar tentativas em `attempts` / `attempt_answers`.
3. Importar as questões reais (script local, chave de serviço, fora do Git).
4. Questões de caso e árvore de decisão da C-Pro R (formato interativo).
5. Gráfico de evolução do desempenho e modo "refazer só os erros".
