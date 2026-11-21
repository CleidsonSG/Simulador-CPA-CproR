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
- `npm install` · `npm run dev` · `npm test` · `npm run build` · `npm run import` (simula) · `npm run import:aplicar`

## Regras importantes
- **Não use o conector/MCP do Supabase neste projeto. Trabalhe só no código local. Não toque em nenhum projeto Supabase** (nem leitura, nem SQL, nem migração). O conector da conta atual aponta para outro projeto (CheckMercado). Banco, chaves e importação ficam com o dono do projeto.
- **Este repositório é PÚBLICO. Nunca commitar questões reais da Anbima** (nem em JSON, CSV, testes ou prints). Elas ficam só no Supabase. A pasta `data-private/` está no `.gitignore`.
- Nunca commitar senhas, chaves de serviço ou `.env`. No front só a URL e a chave pública (anon) do Supabase.
- As questões em `src/data/sampleQuestions.ts` são de exemplo, escritas para o projeto.
- Ponto único de dados: `src/data/source.ts` (`loadQuestions`): banco real com login (`fetchBank`, só `publicada` e `year >= 2026`), senão exemplos.

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
Feito: mapas/casos na prova, cliente Supabase opcional (`src/lib/supabase.ts`; sem `.env` = modo demonstração),
login e-mail/senha (`Account`, `NewPassword`), tentativas e recursos enviados por fila local (`src/lib/sync.ts`),
histórico do banco juntado ao local, script de importação (`npm run import`, ver `scripts/README-importacao.md`),
imagens de caso só do Storage do projeto.
1. O dono cria o `.env` (URL + chave pública) e testa o login real. O Claude não acessa o Supabase (ver Regras importantes).
2. No Supabase Auth: Site URL / Redirect URLs com o endereço do app (confirmação de e-mail e recuperação de senha).
3. Rodar a importação (`npm run import`, depois `npm run import:aplicar`) com `data-private/`.
4. Testar um mapa real importado (confirmar `next[i]` ↔ `options[i]`).
5. Capturar os gráficos dos casos 000105 e 000175 no Storage e publicá-los.
6. Caderno de erros e plano ainda são só locais (podem passar a vir de `attempt_answers`).
