# Importação das questões reais

Roda só no seu computador. Os dados e a chave de serviço **nunca** vão para o Git (o repositório é público).

## 1. Chave (arquivo `.env.local`, na raiz; já está no `.gitignore`)

```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=chave-service-role
```

A service_role fica em Supabase → Project Settings → API. Ela ignora o RLS: não cole em lugar nenhum além deste arquivo.

## 2. Dados (pasta `data-private/`, fora do Git)

`data-private/questions.json` — lista com as colunas da tabela `questions`:

```json
[{ "source_code": "000123", "cert": "CPA", "topic": "…", "pd_code": "2.1.1", "difficulty": "Média",
   "year": 2026, "statement": "…", "options": ["…", "…", "…", "…"], "correct_index": 0,
   "explanation": "…", "explanation_source": "anbima" }]
```

Questão de conjunto: acrescente `"scenario_code": "000140", "scenario_pos": 1` (ou 2).

`data-private/scenarios.json` (opcional) — colunas de `question_scenarios`:
`code, cert, kind ('mapa'|'caso'), year, topic, pd_code, body, status`.
Mapa: `body = {intro, pergunta, rootKey, nodes}`. Caso: `body = {html}`.
Gráficos de caso: suba a imagem no Storage (bucket público) e use `<img src="https://SEU-PROJETO.supabase.co/storage/v1/object/public/…">`;
o app só mostra imagens desse endereço.

## 3. Rodar

```
npm run import          # simula: valida tudo e mostra o que seria inserido
npm run import:aplicar  # grava
```

Só insere códigos novos; o que já existe não é alterado (questões da Anbima são imutáveis).
No fim, confere o hash de integridade (`verify_integrity`).
