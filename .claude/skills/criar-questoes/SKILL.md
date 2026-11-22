---
name: criar-questoes
description: Cria questões ORIGINAIS de treino (CPA, C-Pro R, C-Pro I — programas detalhados 2026 da Anbima) com especialista, criador e revisor independente, valida pelo Guia de elaboração da Anbima e gera o SQL de importação para a tabela de TREINO. Use quando pedirem "gerar/criar questões de treino", "questões para o treino focado", "reforçar tema X", ou numa rotina agendada de geração. Também revisa questões de exemplo existentes.
---

# Criar questões de treino

## Regras inegociáveis (ler antes de tudo)
1. **Questão criada por IA NUNCA entra no simulado nem se mistura às questões oficiais da Anbima.**
   Ela vai só para `public.training_questions` (Treino focado), sempre em **revisão**, e só o
   administrador publica (`publish_training_question`). A tabela oficial `public.questions` recusa
   questão de IA (migração 0009) e o app também a barra no sorteio (`isExamEligible`).
2. **Nunca criar, alterar, copiar nem parafrasear questões oficiais** (banco `source='anbima'`,
   cadernos de questões da Anbima, provas). Não usar questão oficial como molde de texto.
3. **Não usar o conector/MCP do Supabase.** A saída é um arquivo SQL que o dono do projeto roda.
4. **Base de conteúdo só das certificações novas, vigentes a partir de 2026** (CPA, C-Pro R, C-Pro I).
   Nada de CPA-10, CPA-20 ou CEA como referência.
5. Repositório público: os lotes e o SQL ficam em `knowledge-private/questoes-treino/` (fora do Git).

## Fontes (nesta ordem)
- Programas detalhados 2026 e Guia de elaboração de questões: `knowledge-private/anbima-2026/*.txt`
  (texto) — se não existir (ex.: sessão na nuvem), baixe pelos links de `knowledge/FONTES.md`.
- Pesos por macrotema: `src/data/matrix.ts` (CPA 20/40/30/10 · C-Pro R 20/20/40/20 · C-Pro I 40/15/25/20).
- Fatos e números (alíquotas, limites, prazos): fontes primárias — CVM, BCB/CMN, Receita Federal,
  Susep, B3, códigos Anbima. Toda questão com número precisa de fonte primária citada.

## Padrão da questão (Guia de elaboração da Anbima)
- **Contexto profissional + comando no fim.** Uma situação de trabalho (cliente, gerente, assessor)
  que exige aplicar o conhecimento; só as informações necessárias; ~800 caracteres sem espaço
  no contexto + comando. Pessoas e situações diversas (regiões, formações familiares).
- **4 alternativas, 1 correta**, ~500 caracteres sem espaço no total, tamanhos parecidos.
- **Distratores plausíveis**, do mesmo universo do gabarito: nem obviamente errados, nem diferentes
  por um detalhe-armadilha. Bons distratores representam erros reais de quem não domina o tema.
- **Proibido:** "sempre", "nunca", "todos/todas", "completamente", "totalmente"; enunciado negativo
  ("exceto", "incorreta", "não"); "todas/nenhuma das anteriores"; alternativa que cita outra.
- **Domínio cognitivo** declarado (`lembrar`, `compreender`, `aplicar`, `analisar`). No lote, **pelo menos 60%**
  em `aplicar`/`analisar`; `lembrar` no máximo 15%.
- **Cada distrator simula um erro diferente** (campo `distratores`: o equívoco que cada alternativa errada
  representa). Dois distratores com o mesmo erro = um deles sobra.
- **Explicação por alternativa, na ordem do banco:** `A) Correta. … B) Incorreta. … C) Incorreta. … D) Incorreta. …`
  (o app mostra cada justificativa dentro da sua alternativa, mesmo embaralhada), citando a norma/fonte.
- Varie a posição do gabarito no lote (o validador mostra a distribuição A/B/C/D).

## Fluxo (rode na sessão principal — subagentes não chamam outros subagentes)
1. **Escopo e plano.** Certificação, macrotema/tema (`pd_code` do PD 2026) e quantidade. Sem pedido
   específico, priorize os temas com menos questões de treino ou mais erros dos alunos. Antes de escrever,
   monte o plano do lote: para cada questão, `pd_code`, o que o profissional deve saber fazer e o domínio
   cognitivo — respeitando os pesos por macrotema e a meta de 60% em aplicar/analisar.
2. **Briefing do especialista.** Chame o agente `especialista-cpa`, `especialista-cpro-r` ou
   `especialista-cpro-i` com o `pd_code`: ele devolve os pontos cobráveis do item, as regras e números
   vigentes com fontes primárias e os erros comuns (matéria-prima dos distratores).
3. **Criação.** Chame `criador-questoes` com o briefing. Ele escreve o lote em JSON
   (`knowledge-private/questoes-treino/lote-AAAA-MM-DD-<cert>.json`) sem o campo `revisao`.
4. **Revisão independente.** Chame `revisor-questoes` com o arquivo. Ele resolve cada questão SEM
   olhar o gabarito, confere fontes e regras, e preenche `revisao` (`aprovada` | `reprovada` + motivos).
   Reprovadas voltam ao criador com o motivo exato (ex.: "C pode ser defendida", "B é bem mais longa"),
   no máximo DOIS ciclos; se ainda reprovarem, saem do lote.
5. **Validação.** `node scripts/validar-questoes-treino.mjs <lote.json> <lote.sql>`. Só gera SQL se
   não houver erro. Avisos: corrigir quando fizer sentido.
6. **Entrega.** Informe ao dono: quantas aprovadas/reprovadas, temas, distribuição do gabarito,
   e o caminho do `.sql`. Ele roda no SQL Editor do Supabase e publica as que quiser com
   `select public.publish_training_question('<id>', true);`. Nada é publicado automaticamente.

## Formato do lote (JSON)
```json
[{
  "cert": "CPA", "pd_code": "3.1.3.4", "topic": "Finanças pessoais", "difficulty": "Média",
  "dominio": "aplicar",
  "distratores": { "B": "confunde liquidez com rentabilidade", "C": "ignora a marcação a mercado", "D": "esquece o prazo de resgate" },
  "statement": "Contexto profissional… Comando no fim:",
  "options": ["…", "…", "…", "…"], "correct_index": 0,
  "explanation": "A) Correta. … B) Incorreta. … C) Incorreta. … D) Incorreta. …",
  "fontes": ["Resolução CVM 30, art. …", "https://…"],
  "revisao": { "veredito": "aprovada", "revisor": "revisor-questoes", "notas": "…" }
}]
```
`topic` usa o nome do tema como aparece no app (os temas do banco); `pd_code` é o item mais específico do PD.

## Revisar questões de exemplo
Para revisar `src/data/sampleQuestions.ts` / `sampleScenarios.ts` (também escritas por IA): chame
`revisor-questoes` apontando para o arquivo; ele devolve um relatório por questão. Corrigir o arquivo
só com aprovação do dono — são as questões da degustação.
