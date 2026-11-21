---
description: Analisa os recursos pendentes de questões e aplica a regra de quarentena
---
Use o agente `agente-recursos` para processar todos os recursos com status pendente (`select * from public.appeals where status = 'pendente'`). Ao final, mostre o resumo e as questões em quarentena (`select * from public.questions_quarantine`).
