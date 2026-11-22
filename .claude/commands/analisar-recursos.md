---
description: Analisa os recursos pendentes (a partir de uma exportação) e gera o SQL com as decisões
---
Sem conector/MCP do Supabase: o dono exporta, o agente decide, o dono executa.

1. Peça ao dono para rodar no SQL Editor do Supabase e salvar o resultado (CSV ou JSON) em `knowledge-private/recursos/` (fora do Git — contém questões reais):

```sql
select a.id as appeal_id, a.cert, a.category, a.argument, a.chosen_index, a.created_at,
       q.id as question_id, q.source_code, q.pd_code, q.topic, q.statement, q.options, q.correct_index, q.explanation
  from public.appeals a join public.questions q on q.id = a.question_id
 where a.status = 'pendente'
 order by a.created_at;
```

2. Use o agente `agente-recursos` com esse arquivo. Ele grava `knowledge-private/recursos/decisoes-AAAA-MM-DD.sql`.
3. Mostre o resumo e peça ao dono para rodar o SQL no SQL Editor (logado como administrador). Depois, ele confere a quarentena com `select * from public.questions_quarantine;`.
