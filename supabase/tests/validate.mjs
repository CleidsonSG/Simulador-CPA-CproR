// Valida as migrações em um Postgres local (PGlite), simulando o Supabase (auth.uid, roles, RLS).
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const db = new PGlite();
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failed++; };
// Erro de GRANT (falta de permissão na tabela/função/esquema), diferente de RLS, CHECK ou trigger.
const GRANT_ERR = /permission denied for (table|function|schema|sequence|view)/i;
/**
 * Espera que a operação seja recusada. Por padrão, recusa por falta de GRANT NÃO conta: ela esconderia
 * a regra que se quer testar (CHECK, trigger, RLS). Use { grant: true } quando o esperado é justamente o GRANT.
 */
const rejects = async (fn, msg, { grant = false } = {}) => {
  try { await fn(); ok(false, msg + ' (não deu erro)'); }
  catch (e) {
    const isGrant = GRANT_ERR.test(e.message);
    if (isGrant && !grant) ok(false, `${msg} — recusado por falta de GRANT, não pela regra: ${e.message}`);
    else if (!isGrant && grant) ok(false, `${msg} — esperava falta de GRANT, veio: ${e.message}`);
    else ok(true, msg);
  }
};
/** Espera que a operação funcione (sem erro de permissão nem outro). */
const allows = async (fn, msg) => {
  try { const r = await fn(); ok(true, msg); return r; }
  catch (e) { ok(false, `${msg} — ${e.message}`); return null; }
};
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
// Erro inesperado: mensagem curta em vez do despejo do PGlite.
const fatal = (e) => {
  console.log(`\n  ✗ erro inesperado: ${e?.message ?? e}${e?.query ? `\n    em: ${e.query.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
  console.log('\nTeste interrompido.');
  process.exit(1);
};
process.on('unhandledRejection', fatal);
process.on('uncaughtException', fatal);

// ── Stub mínimo do Supabase ──
// Como num projeto NOVO do Supabase: tabelas criadas por SQL não dão acesso automático a ninguém.
// Nenhum GRANT de tabela aqui — tudo o que anon/authenticated/service_role podem fazer tem de vir das migrações.
// (service_role tem BYPASSRLS, como no Supabase, mas também precisa de GRANT.)
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key, email varchar(255), invited_at timestamptz, email_confirmed_at timestamptz default now(),
    last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
`);
const MIGRATIONS = readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const apply = async (f) => db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));

// Como no projeto real: as contas (e o admin em app_admins) já existiam antes da 0007 (perfis).
const ADMIN = '00000000-0000-0000-0000-0000000000aa';
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
for (const f of MIGRATIONS.filter((m) => m < '0007')) await apply(f);
await db.exec(`insert into auth.users(id, email) values ('${ADMIN}','admin@teste'), ('${U(1)}','u1@teste'), ('${U(2)}','u2@teste'), ('${U(3)}','u3@teste'), ('${U(4)}','u4@teste');
               insert into public.app_admins(user_id) values ('${ADMIN}');`);
for (const f of MIGRATIONS.filter((m) => m >= '0007')) await apply(f);
console.log(`Migrações aplicadas sem erro: ${MIGRATIONS.join(', ')}.\n`);
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

console.log('0. Permissões (GRANT) — as mesmas operações do app, do histórico e da importação');
const QCOLS = 'id,cert,topic,pd_code,difficulty,year,statement,options,correct_index,explanation,source,explanation_source,scenario_code,scenario_pos';
const SCOLS = 'code,cert,kind,year,topic,pd_code,body,source';
const someQ = (await q1(`select id from public.questions where source_code = 'T1-0'`))[0].id;

// Visitante sem login (anon): nada.
await as(null, 'anon');
await rejects(() => db.query(`select id from public.questions limit 1`), 'anon não lê questões', { grant: true });
await rejects(() => db.query(`insert into public.attempts (cert, total, pass_mark) values ('CPA', 50, 35)`), 'anon não grava tentativa', { grant: true });

// Usuário logado: exatamente o que src/data/remote.ts e src/lib/sync.ts fazem.
await as(U(4));
const read = await allows(() => q1(`select ${QCOLS} from public.questions where cert = 'CPA' and status = 'publicada' and year >= 2026 order by id limit 1000`), 'logado lê questões (colunas do app)');
ok((read?.length ?? 0) > 0, 'logado enxerga as questões publicadas');
await allows(() => q1(`select ${SCOLS} from public.question_scenarios where cert = 'CPA' and status = 'publicada'`), 'logado lê mapas e casos');
await allows(() => q1(`select * from public.exam_blueprint`), 'logado lê o blueprint da prova');
await allows(() => q1(`select * from public.generate_exam('CPA')`), 'logado sorteia a prova (generate_exam)');
await allows(() => q1(`select * from public.generate_exam_scenarios('CPA')`), 'logado sorteia os conjuntos (generate_exam_scenarios)');
const attId = '00000000-0000-4000-8000-000000000004';
const attSql = `insert into public.attempts (id, cert, started_at, finished_at, used_seconds, correct, total, pass_mark, passed)
                values ($1,'CPA',now(),now(),60,1,1,1,true) on conflict (id) do nothing`;
await allows(() => db.query(attSql, [attId]), 'logado grava tentativa (upsert ignorando duplicata)');
await allows(() => db.query(attSql, [attId]), 'reenviar a mesma tentativa não dá erro');
await allows(() => db.query(`insert into public.attempt_answers (attempt_id, question_id, chosen_index, is_correct) values ($1,$2,0,true)
                              on conflict (attempt_id, question_id) do nothing`, [attId, someQ]), 'logado grava respostas');
await allows(() => db.query(`update public.attempts set used_seconds = 61 where id = $1`, [attId]), 'logado atualiza a própria tentativa');
await allows(() => q1(`select id,cert,started_at,finished_at,used_seconds,correct,total,pass_mark,passed from public.attempts where finished_at is not null`), 'logado lê o próprio histórico');
await allows(() => q1(`select attempt_id,question_id,is_correct from public.attempt_answers where attempt_id = $1`, [attId]), 'logado lê as próprias respostas');
await allows(() => q1(`select id,topic from public.questions where id = $1`, [someQ]), 'logado lê o tema das questões do histórico');
await allows(() => db.query(`insert into public.appeals (question_id, cert, category, argument, chosen_index)
                              values ($1,'CPA','fora_do_programa','Argumento de teste com mais de vinte caracteres.',0)`, [someQ]), 'logado envia recurso');
await allows(() => q1(`select * from public.appeals`), 'logado lê os próprios recursos');
await allows(() => q1(`select * from public.appeal_decisions`), 'logado lê as decisões dos próprios recursos');
await rejects(() => db.query(`insert into public.questions (cert, topic, difficulty, year, statement, options, correct_index) values ('CPA','x','Média',2026,'x','["a","b","c","d"]',0)`), 'logado não insere questão', { grant: true });
await rejects(() => db.query(`delete from public.attempts where id = $1`, [attId]), 'logado não apaga tentativa', { grant: true });
await allows(() => q1(`select count(*)::int n from public.questions_quarantine`), 'logado consulta a quarentena sem erro (RLS devolve vazio)');

// Admin (logado pelo app): funções administrativas.
await as(ADMIN);
for (const fn of ['record_decision(uuid, text, numeric, text, text[], jsonb, text)', 'quarantine_question(uuid, text)',
                  'restore_question(uuid)', 'insert_generated_question(text, text, text, text, text, jsonb, int, text, text, boolean)']) {
  ok((await q1(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') p`))[0].p, `logado pode chamar ${fn.split('(')[0]} (a função confere is_admin)`);
  ok(!(await q1(`select has_function_privilege('anon', 'public.${fn}', 'execute') p`))[0].p, `anon NÃO pode chamar ${fn.split('(')[0]}`);
}

// Script de importação (chave de serviço = service_role).
await as(null, 'service_role');
await allows(() => q1(`select code from public.question_scenarios`), 'importação lê os códigos de cenários');
await allows(() => q1(`select source_code from public.questions where source_code is not null limit 100000`), 'importação lê os códigos de questões');
await allows(() => db.query(`insert into public.question_scenarios (code, cert, kind, year, topic, body, source, status)
                              values ('IMP-1','CPRO_R','caso',2026,'Importado','{"html":"<p>x</p>"}','anbima','publicada') on conflict (code) do nothing`), 'importação insere cenário');
await allows(() => db.query(`insert into public.questions (source_code, cert, topic, difficulty, year, statement, options, correct_index, source, status)
                              values ('IMP-Q1','CPRO_R','Importado','Média',2026,'Enunciado importado','["a","b","c","d"]',0,'anbima','publicada')
                              on conflict (source_code) do nothing`), 'importação insere questão');
await allows(() => q1(`select * from public.verify_integrity()`), 'importação confere a integridade (verify_integrity)');
await asOwner();

console.log('\n1. Imutabilidade das questões da Anbima');
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
const ids = (await q1(`select id from public.appeals where question_id = $1 order by created_at`, [target])).map((r) => r.id);
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

console.log('\n5. Mapas de decisão e casos (conjuntos)');
await asOwner();
const body = JSON.stringify({ intro: 'Cliente de exemplo', pergunta: 'Escolha', rootKey: 'k', nodes: { k: { client: 'Oi', options: ['a','b','c','d'], next: [], end: false } } });
await db.query(`insert into public.question_scenarios (code, cert, kind, year, topic, body) values ('T001','CPA','mapa',2026,'Teste',$1::jsonb)`, [body]);
for (const pos of [1, 2]) {
  await db.query(`insert into public.questions (cert, topic, difficulty, year, statement, options, correct_index, explanation, source, source_code, status, scenario_code, scenario_pos)
                  values ('CPA','Teste','Média',2026,$1,$2::jsonb,0,'e','anbima',$3,'publicada','T001',$4)`, ['Questão de conjunto ' + pos, JSON.stringify(good), 'T001-' + pos, pos]);
}
ok((await q1(`select public.verify_scenarios_integrity() n`))[0].n === 0, 'hash do cenário confere');
await rejects(() => db.query(`update public.question_scenarios set body = '{}'::jsonb where code = 'T001'`), 'corpo do mapa da Anbima é imutável');
await rejects(() => db.query(`delete from public.question_scenarios where code = 'T001'`), 'mapa da Anbima não pode ser apagado');
await as(U(1));
const sc = await q1(`select * from public.generate_exam_scenarios('CPA')`);
ok(sc.length === 1 && sc[0].scenario_code === 'T001', 'sorteia o conjunto completo');
const mc = await q1(`select * from public.generate_exam('CPA', 50)`);
ok(!mc.some(r => ['T001'].includes(r.scenario_code)) && (await q1(`select count(*)::int n from public.questions q join public.generate_exam('CPA', 50) g on g.question_id = q.id where q.scenario_code is not null`))[0].n === 0, 'sorteio de múltipla escolha ignora questões de conjunto');

console.log('\n6. Perfis, aprovação de acesso e painel de administração');
const N = (n) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
const prof = async (id) => { await asOwner(); return (await q1(`select status, role, invited, email from public.profiles where user_id = $1`, [id]))[0]; };
const signup = async (id, extra = '') => { await asOwner(); await db.exec(`insert into auth.users (id, email${extra ? ', ' + extra.split('|')[0] : ''}) values ('${id}', '${id.slice(-3)}@teste'${extra ? ', ' + extra.split('|')[1] : ''})`); };
const readsQuestions = async (id) => { await as(id); return (await q1(`select count(*)::int n from public.questions`))[0].n; };

let p = await prof(ADMIN);
ok(p.status === 'aprovado' && p.role === 'admin', 'conta que já era admin (app_admins) virou perfil admin aprovado');
p = await prof(U(1));
ok(p.status === 'aprovado' && p.role === 'aluno', 'contas que já existiam ficaram aprovadas como aluno');

await signup(N(1));
p = await prof(N(1));
ok(p.status === 'pendente' && p.role === 'aluno' && !p.invited, 'cadastro novo entra pendente, como aluno');
ok((await readsQuestions(N(1))) === 0, 'pendente não lê nenhuma questão');
ok((await q1(`select count(*)::int n from public.question_scenarios`))[0].n === 0, 'pendente não lê mapas e casos');
ok((await q1(`select count(*)::int n from public.generate_exam('CPA')`))[0].n === 0, 'pendente não consegue sortear prova');
await rejects(() => db.query(`insert into public.attempts (cert, total, pass_mark) values ('CPA', 50, 35)`), 'pendente não grava tentativa (RLS)');
await rejects(() => db.query(`insert into public.appeals (question_id, cert, category, argument) values ($1,'CPA','outro','Argumento de teste com mais de vinte caracteres.')`, [someQ]), 'pendente não envia recurso (RLS)');
ok((await q1(`select count(*)::int n from public.profiles`))[0].n === 1, 'usuário comum só enxerga o próprio perfil');
await rejects(() => db.query(`update public.profiles set status = 'aprovado' where user_id = $1`, [N(1)]), 'ninguém se aprova sozinho (sem permissão de update)', { grant: true });
await rejects(() => db.query(`select * from public.admin_list_users()`), 'não-admin não lista usuários');
await rejects(() => db.query(`select public.admin_set_user($1, 'aprovado')`, [N(1)]), 'não-admin não aprova ninguém');
await rejects(() => db.query(`select public.admin_set_signup_auto(true)`), 'não-admin não muda o cadastro');

await signup(N(2), `raw_user_meta_data|'{"convite_perfil":"admin"}'::jsonb`);
p = await prof(N(2));
ok(p.status === 'pendente' && p.role === 'aluno', 'cadastro comum com "convite_perfil=admin" forjado NÃO vira admin nem é aprovado');

await signup(N(3), `invited_at, raw_user_meta_data|now(), '{"convite_perfil":"admin"}'::jsonb`);
p = await prof(N(3));
ok(p.status === 'aprovado' && p.role === 'admin' && p.invited, 'convite de admin entra aprovado como admin');
await signup(N(4), `invited_at, raw_user_meta_data|now(), '{"convite_perfil":"aluno"}'::jsonb`);
p = await prof(N(4));
ok(p.status === 'aprovado' && p.role === 'aluno', 'convite de aluno entra aprovado como aluno');

await as(ADMIN);
const listed = await allows(() => q1(`select * from public.admin_list_users()`), 'admin lista os usuários');
ok((listed ?? []).length >= 9 && listed[0].status === 'pendente', 'lista traz todos, com os pendentes primeiro');
await allows(() => db.query(`select public.admin_set_user($1, 'aprovado')`, [N(1)]), 'admin aprova um pendente');
ok((await readsQuestions(N(1))) > 0, 'aprovado passa a ler as questões');
await allows(() => db.query(`insert into public.attempts (cert, total, pass_mark) values ('CPA', 50, 35)`), 'aprovado grava tentativa');

await as(ADMIN);
await db.query(`select public.admin_set_user($1, 'bloqueado')`, [U(1)]);
ok((await readsQuestions(U(1))) === 0, 'bloqueado perde o acesso às questões na hora');
await rejects(() => db.query(`insert into public.attempts (cert, total, pass_mark) values ('CPA', 50, 35)`), 'bloqueado não grava tentativa');
await as(ADMIN);
await db.query(`select public.admin_set_user($1, 'aprovado')`, [U(1)]);
ok((await readsQuestions(U(1))) > 0, 'desbloquear devolve o acesso');

await as(ADMIN);
await rejects(() => db.query(`select public.admin_set_user($1, 'bloqueado')`, [ADMIN]), 'admin não bloqueia a própria conta');
await rejects(() => db.query(`select public.admin_set_user($1, null, 'aluno')`, [ADMIN]), 'admin não se rebaixa');
await rejects(() => db.query(`select public.admin_set_user($1, 'qualquer')`, [N(1)]), 'situação inválida é recusada');
await allows(() => db.query(`select public.admin_set_user($1, null, 'admin')`, [U(2)]), 'admin promove outro usuário a admin');
await as(U(2));
ok((await q1(`select count(*)::int n from public.admin_list_users()`))[0].n > 0, 'novo admin já usa o painel');
await as(ADMIN);
await db.query(`select public.admin_set_user($1, null, 'aluno')`, [U(2)]);
await as(U(2));
await rejects(() => db.query(`select * from public.admin_list_users()`), 'rebaixado perde o painel na hora');
// Último admin: nem a chave de serviço deixa o sistema sem administrador.
await asOwner();
await db.exec(`update public.profiles set role = 'aluno' where role = 'admin' and user_id <> '${ADMIN}'`);
await as(null, 'service_role');
await rejects(() => db.query(`select public.admin_set_user($1, 'bloqueado')`, [ADMIN]), 'não deixa bloquear o último administrador', { grant: false });

await as(ADMIN);
ok((await q1(`select public.admin_get_signup_auto() v`))[0].v === false, 'padrão: cadastro novo fica pendente');
await db.query(`select public.admin_set_signup_auto(true)`);
await signup(N(5));
ok((await prof(N(5))).status === 'aprovado', 'com "aprovar automaticamente", cadastro novo já entra aprovado');
await as(ADMIN);
await db.query(`select public.admin_set_signup_auto(false)`);
await signup(N(6));
ok((await prof(N(6))).status === 'pendente', 'desligado de novo: volta a ficar pendente');

await asOwner();
await db.exec(`update auth.users set email = 'novo@teste' where id = '${N(6)}'`);
ok((await prof(N(6))).email === 'novo@teste', 'troca de e-mail no Auth atualiza o perfil');

await as(null, 'anon');
await rejects(() => db.query(`select * from public.admin_list_users()`), 'anon não chama as funções do painel', { grant: true });
await asOwner();

console.log(failed ? `\n${failed} verificação(ões) FALHARAM` : '\nTodas as verificações passaram.');
process.exit(failed ? 1 : 0);
