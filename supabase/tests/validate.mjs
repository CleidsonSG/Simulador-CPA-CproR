// Valida as migrações em um Postgres local (PGlite), simulando o Supabase (auth.uid, roles, RLS).
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failed++; };
const rejects = async (fn, msg) => { try { await fn(); ok(false, msg + ' (não deu erro)'); } catch { ok(true, msg); } };
const q1 = async (sql, params) => (await db.query(sql, params)).rows;

// ── Stub mínimo do Supabase ──
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
for (const f of ['0001_init.sql', '0002_integridade_recursos_quarentena.sql', '0003_classificacao_editavel.sql']) {
  await db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
}
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;`);
console.log('Migrações 0001 e 0002 aplicadas sem erro.\n');

const ADMIN = '00000000-0000-0000-0000-0000000000aa';
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`insert into auth.users(id) values ('${ADMIN}'), ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
               insert into public.app_admins(user_id) values ('${ADMIN}');`);
const as = async (sub, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false), set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
};
const asOwner = async () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);

// ── Banco de teste: 200 questões da "Anbima" no padrão do PD ──
await asOwner();
const per = { 1: 40, 2: 80, 3: 60, 4: 20 };
for (const [m, n] of Object.entries(per)) {
  for (let i = 0; i < n; i++) {
    await db.query(
      `insert into public.questions (source_code, cert, topic, pd_code, difficulty, year, statement, options, correct_index, source, explanation_source)
       values ($1,'CPA',$2,$3,'Média',2026,$4,$5,$6,'anbima',null)`,
      [`T${m}-${i}`, `Tópico ${m}.${i % 5}`, `${m}.${(i % 5) + 1}.1`, `Enunciado ${m}-${i} ao pé da letra`, JSON.stringify(['A','B','C','D']), i % 4],
    );
  }
}

console.log('1. Imutabilidade das questões da Anbima');
const sample = (await q1(`select id, content_hash from public.questions where source_code = 'T2-0'`))[0];
ok(!!sample.content_hash, 'carimbo de integridade gravado na inserção');
await rejects(() => db.query(`update public.questions set statement = 'alterado' where id = $1`, [sample.id]), 'não deixa alterar o enunciado');
await rejects(() => db.query(`update public.questions set options = '["x","y","z","w"]' where id = $1`, [sample.id]), 'não deixa alterar as alternativas');
await db.query(`update public.questions set pd_code = '2.9', topic = 'Tópico reclassificado' where id = $1`, [sample.id]);
ok(true, 'permite corrigir a classificação (PD e tópico)');
await rejects(() => db.query(`update public.questions set correct_index = 3 where id = $1`, [sample.id]), 'não deixa alterar o gabarito');
await rejects(() => db.query(`delete from public.questions where id = $1`, [sample.id]), 'não deixa apagar direto');
await db.query(`update public.questions set explanation = 'explicação da IA', explanation_source = 'ia' where id = $1`, [sample.id]);
ok(true, 'permite acrescentar explicação (separada do texto original)');
ok((await q1(`select count(*)::int n from public.verify_integrity()`))[0].n === 0, 'verify_integrity: nenhuma questão adulterada');

console.log('\n2. Sorteio da prova (generate_exam)');
const counts = (rows) => { const c = {}; rows.forEach((r) => { c[r.macro] = (c[r.macro] ?? 0) + 1; }); return c; };
let prev = null; let worstDev = 0; let overlapMax = 0; let sameOrder = 0;
await as(U(1));
for (let t = 0; t < 12; t++) {
  const rows = await q1(`select e.question_id, e.pos, split_part(q.pd_code,'.',1)::int macro
                           from public.generate_exam('CPA') e join public.questions q on q.id = e.question_id order by e.pos`);
  const c = counts(rows);
  worstDev = Math.max(worstDev, Math.abs((c[1]??0)-10), Math.abs((c[2]??0)-20), Math.abs((c[3]??0)-15), Math.abs((c[4]??0)-5));
  if (rows.length !== 50) ok(false, `prova com ${rows.length} questões`);
  if (prev) {
    const ids = new Set(prev.map((r) => r.question_id));
    overlapMax = Math.max(overlapMax, rows.filter((r) => ids.has(r.question_id)).length);
    if (rows.map((r) => r.question_id).join() === prev.map((r) => r.question_id).join()) sameOrder++;
  }
  // registra a tentativa e as respostas (como o app fará)
  await asOwner();
  const att = (await q1(`insert into public.attempts (user_id, cert, total, pass_mark) values ($1,'CPA',50,35) returning id`, [U(1)]))[0].id;
  for (const r of rows) await db.query(`insert into public.attempt_answers (attempt_id, question_id, chosen_index, is_correct) values ($1,$2,0,false)`, [att, r.question_id]);
  await as(U(1));
  prev = rows;
}
ok(worstDev <= 2, `cotas por macrotema seguem 20/40/30/10% (maior desvio: ${worstDev} questão)`);
ok(overlapMax <= 3, `não repete a tentativa anterior (maior repetição: ${overlapMax} de 50)`);
ok(sameOrder === 0, 'a ordem nunca é igual à anterior');

// C-Pro I: 40 questões, cotas 40/15/25/20
await asOwner();
for (const [m, n] of Object.entries({ 1: 50, 2: 20, 3: 30, 4: 25 })) {
  for (let i = 0; i < n; i++) {
    await db.query(`insert into public.questions (source_code, cert, topic, pd_code, difficulty, year, statement, options, correct_index, source)
                    values ($1,'CPRO_I',$2,$3,'Média',2026,$4,$5,0,'anbima')`, [`I${m}-${i}`, `Tópico I${m}.${i % 4}`, `${m}.${(i % 4) + 1}`, `Enunciado I ${m}-${i}`, JSON.stringify(['A','B','C','D'])]);
  }
}
await as(U(1));
const ci = counts(await q1(`select split_part(q.pd_code,'.',1)::int macro from public.generate_exam('CPRO_I') e join public.questions q on q.id = e.question_id`));
ok(Object.values(ci).reduce((a, b) => a + b, 0) === 40 && ci[1] === 16 && ci[2] === 6 && ci[3] === 10 && ci[4] === 8, `C-Pro I: 40 questões com cotas 40/15/25/20% (${JSON.stringify(ci)})`);

console.log('\n3. Recursos, decisão do agente e quarentena (só admin)');
await asOwner();
const target = (await q1(`select id from public.questions where source_code = 'T3-1'`))[0].id;
await as(U(1));
await db.query(`insert into public.appeals (question_id, cert, category, argument) values ($1,'CPA','gabarito_incorreto','O gabarito está incorreto porque a norma vigente diz outra coisa.')`, [target]);
await rejects(() => db.query(`insert into public.appeals (question_id, cert, category, argument) values ($1,'CPA','outro','curto')`, [target]), 'recurso com argumento curto é recusado');
await rejects(() => db.query(`insert into public.appeals (question_id, cert, category, argument) values ($1,'CPA','gabarito_incorreto','Segundo recurso do mesmo usuário para a mesma questão.')`, [target]), 'um recurso por usuário por questão');
await rejects(() => db.query(`insert into public.appeals (question_id, cert, user_id, category, argument) values ($1,'CPA',$2,'outro','Tentando criar recurso em nome de outra pessoa aqui.')`, [target, U(2)]), 'não cria recurso em nome de outro usuário');
for (const n of [2, 3]) {
  await as(U(n));
  await db.query(`insert into public.appeals (question_id, cert, category, argument) values ($1,'CPA','gabarito_incorreto','Mesmo problema relatado pelo usuário ${n} com argumento suficiente.')`, [target]);
}
await as(U(1));
ok((await q1(`select count(*)::int n from public.appeals`))[0].n === 1, 'usuário só enxerga o próprio recurso');
await rejects(() => db.query(`select public.record_decision((select id from public.appeals limit 1), 'deferido', 0.9, 'x')`), 'usuário comum não registra decisão');

await as(ADMIN);
const ids = (await q1(`select id from public.appeals order by created_at`)).map((r) => r.id);
let r1 = (await q1(`select public.record_decision($1,'deferido',0.9,'Fonte primária contradiz o gabarito.', '{3.1.1}', '[{"url":"https://exemplo"}]') r`, [ids[0]]))[0].r;
let r2 = (await q1(`select public.record_decision($1,'deferido',0.5,'Evidência fraca.') r`, [ids[1]]))[0].r;
ok(r1 === 'mantida' && r2 === 'mantida', '1 deferido forte + 1 fraco: questão continua na prova');
ok((await q1(`select count(*)::int n from public.questions where id = $1`, [target]))[0].n === 1, 'questão ainda está no banco de prova');
let r3 = (await q1(`select public.record_decision($1,'deferido',0.95,'Confirmado por norma vigente.') r`, [ids[2]]))[0].r;
ok(r3 === 'mantida', 'confiança baixa de um dos recursos impede a quarentena (2 fortes < limiar 3)');
// admin reanalisa o recurso fraco com evidência melhor
r3 = (await q1(`select public.record_decision($1,'deferido',0.8,'Reanálise com fonte oficial.', '{}', '[]', 'admin') r`, [ids[1]]))[0].r;
ok(r3 === 'quarentena', '3 recursos deferidos (≥ 0,7) de usuários diferentes → quarentena');
ok((await q1(`select count(*)::int n from public.questions where id = $1`, [target]))[0].n === 0, 'questão saiu do banco de prova');
ok((await q1(`select count(*)::int n from public.questions_quarantine where question_id = $1`, [target]))[0].n === 1, 'questão está na quarentena (admin enxerga)');

await as(U(1));
ok((await q1(`select count(*)::int n from public.questions_quarantine`))[0].n === 0, 'usuário comum NÃO enxerga a quarentena');
await rejects(() => db.query(`select public.restore_question($1)`, [target]), 'usuário comum não restaura');
ok((await q1(`select count(*)::int n from public.generate_exam('CPA') e where e.question_id = $1`, [target]))[0].n === 0, 'questão em quarentena não é sorteada');
ok((await q1(`select count(*)::int n from public.appeal_decisions`))[0].n >= 1, 'dono do recurso vê a decisão do próprio recurso');

await as(ADMIN);
await db.query(`select public.restore_question($1)`, [target]);
ok((await q1(`select count(*)::int n from public.questions where id = $1`, [target]))[0].n === 1, 'admin restaura a questão');
await asOwner();
ok((await q1(`select count(*)::int n from public.verify_integrity()`))[0].n === 0, 'após restaurar, o conteúdo continua idêntico (hash confere)');

console.log('\n4. Agente criador de questões');
await as(ADMIN);
const good = ['Opção A', 'Opção B', 'Opção C', 'Opção D'];
const id1 = (await q1(`select public.insert_generated_question('CPA','2.1.1','Renda fixa','Média','Enunciado criado pelo agente?', $1::jsonb, 2, 'Explicação.', 'agente', true) id`, [JSON.stringify(good)]))[0].id;
ok(!!id1, 'insere questão gerada (4 alternativas, 1 correta)');
const row = (await q1(`select source, status, explanation_source from public.questions where id = $1`, [id1]))[0];
ok(row.source === 'ia' && row.status === 'publicada', 'marcada como source=ia e publicada após verificação');
const id2 = (await q1(`select public.insert_generated_question('CPA','2.1.1','Renda fixa','Média','Outro enunciado sem verificação?', $1::jsonb, 0, 'Explicação.', 'agente', false) id`, [JSON.stringify(good)]))[0].id;
ok((await q1(`select status from public.questions where id = $1`, [id2]))[0].status === 'revisao', 'sem verificação independente → fica em revisão');
await rejects(() => db.query(`select public.insert_generated_question('CPA','2.1.1','x','Média','Enunciado criado pelo agente?', $1::jsonb, 2, 'e', 'agente', true)`, [JSON.stringify(good)]), 'recusa enunciado duplicado');
await rejects(() => db.query(`select public.insert_generated_question('CPA','2.1.1','x','Média','Novo?', '["a","a","b","c"]'::jsonb, 2, 'e', 'agente', true)`), 'recusa alternativas repetidas');
await rejects(() => db.query(`select public.insert_generated_question('CPA','2.1.1','x','Média','Novo 2?', '["a","b","c"]'::jsonb, 2, 'e', 'agente', true)`), 'recusa menos de 4 alternativas');
await as(U(1));
ok((await q1(`select count(*)::int n from public.questions where id = $1`, [id2]))[0].n === 0, 'aluno não vê questão em revisão');
await rejects(() => db.query(`select public.insert_generated_question('CPA','2.1.1','x','Média','Novo 3?', $1::jsonb, 1, 'e', 'agente', true)`, [JSON.stringify(good)]), 'aluno não cria questão');

console.log(failed ? `\n${failed} verificação(ões) FALHARAM` : '\nTodas as verificações passaram.');
process.exit(failed ? 1 : 0);
