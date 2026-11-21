# Simulador Anbima — CPA e C-Pro R

Simulados no formato da prova real, com feedback imediato e explicação dos erros.

| Prova | Questões | Tempo | Aprovação |
|---|---|---|---|
| CPA | 50 | 2h30 | 35 acertos (70%) |
| C-Pro R | 45 | 2h30 | 32 acertos (71%) |

> Material de estudo independente, sem vínculo com a Anbima. Este repositório contém apenas questões de **exemplo**.

## Rodar no computador (VS Code)
```bash
git clone https://github.com/CleidsonSG/Simulador-CPA-CproR.git
cd Simulador-CPA-CproR
npm install
npm run dev      # http://localhost:5173
npm test         # testes da lógica da prova
npm run build
```
Abra a pasta no VS Code e rode o Claude Code nela; o `CLAUDE.md` já traz o contexto.

## Banco (Supabase)
1. Crie o projeto (região São Paulo) na sua conta Supabase.
2. Cole `supabase/migrations/0001_init.sql` no SQL Editor.
3. Copie `.env.example` para `.env` e preencha a URL e a chave pública (anon).

## Estrutura
- `src/lib/exam.ts` — regras, nota de corte, sorteio e correção
- `src/data/source.ts` — origem das questões (hoje: exemplo)
- `src/components/` — Home, Quiz, Result
- `supabase/migrations/` — esquema do banco com RLS
