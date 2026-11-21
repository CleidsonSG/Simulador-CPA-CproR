// Importa as questões reais para o Supabase. Roda SÓ no seu computador.
//
//   node scripts/import-questions.mjs            → simula (valida e mostra o que faria; não grava nada)
//   node scripts/import-questions.mjs --aplicar  → grava de verdade
//
// Lê:  data-private/scenarios.json (opcional) e data-private/questions.json  — fora do Git.
// Usa: .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY — fora do Git. Nunca use essa chave no front.
// Nunca altera o que já existe (questões da Anbima são imutáveis): só insere códigos novos.
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { checkSets, parseEnv, validateQuestion, validateScenario } from './import-lib.mjs';

const root = new URL('../', import.meta.url);
const apply = process.argv.includes('--aplicar');
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const envFile = new URL('.env.local', root);
const env = { ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}), ...process.env };
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (veja scripts/README-importacao.md).');
  process.exit(1);
}
if (!existsSync(new URL('data-private/questions.json', root))) {
  console.error('Não achei data-private/questions.json.');
  process.exit(1);
}

const scenarios = existsSync(new URL('data-private/scenarios.json', root)) ? read('data-private/scenarios.json') : [];
const questions = read('data-private/questions.json');
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: dbScen, error: e1 } = await sb.from('question_scenarios').select('code');
if (e1) throw new Error(`Falha ao ler question_scenarios: ${e1.message}`);
const { data: dbQ, error: e2 } = await sb.from('questions').select('source_code').not('source_code', 'is', null).limit(100000);
if (e2) throw new Error(`Falha ao ler questions: ${e2.message}`);
const haveScen = new Set(dbScen.map((r) => r.code));
const haveQ = new Set(dbQ.map((r) => r.source_code));
const allScen = new Set([...haveScen, ...scenarios.map((s) => s.code)]);

let bad = 0;
const report = (what, id, errs) => {
  bad++;
  console.log(`  ✗ ${what} ${id ?? '(sem código)'}: ${errs.join('; ')}`);
};
console.log(`Validando ${scenarios.length} cenários e ${questions.length} questões…`);
scenarios.forEach((s) => { const e = validateScenario(s); if (e.length) report('cenário', s?.code, e); });
questions.forEach((q) => { const e = validateQuestion(q, allScen); if (e.length) report('questão', q?.source_code, e); });
for (const e of checkSets(questions)) report('conjunto', '', [e]);
const dup = questions.map((q) => q.source_code).filter((c, i, a) => a.indexOf(c) !== i);
if (dup.length) report('arquivo', '', [`source_code repetido: ${[...new Set(dup)].join(', ')}`]);
if (bad) {
  console.log(`\n${bad} problema(s). Nada foi gravado. Corrija o arquivo e rode de novo.`);
  process.exit(1);
}

const newScen = scenarios.filter((s) => !haveScen.has(s.code)).map((s) => ({ source: 'anbima', status: 'publicada', ...s }));
const newQ = questions.filter((q) => !haveQ.has(q.source_code)).map((q) => ({ source: 'anbima', status: 'publicada', ...q }));
console.log(`\nNovos: ${newScen.length} cenários, ${newQ.length} questões. Já existiam: ${scenarios.length - newScen.length} cenários, ${questions.length - newQ.length} questões (não serão alterados).`);
const byCert = {};
for (const q of newQ) byCert[q.cert] = (byCert[q.cert] ?? 0) + 1;
console.log('Por certificação:', JSON.stringify(byCert));

if (!apply) {
  console.log('\nSimulação concluída. Para gravar, rode com --aplicar.');
  process.exit(0);
}

for (let i = 0; i < newScen.length; i += 100) {
  const { error } = await sb.from('question_scenarios').upsert(newScen.slice(i, i + 100), { onConflict: 'code', ignoreDuplicates: true });
  if (error) throw new Error(`Falha nos cenários: ${error.message}`);
}
for (let i = 0; i < newQ.length; i += 200) {
  const { error } = await sb.from('questions').upsert(newQ.slice(i, i + 200), { onConflict: 'source_code', ignoreDuplicates: true });
  if (error) throw new Error(`Falha nas questões: ${error.message}`);
}
const { data: bad1, error: e3 } = await sb.rpc('verify_integrity');
console.log(`\n✓ Gravado. Integridade: ${e3 ? 'não verificada (' + e3.message + ')' : (bad1?.length ?? 0) + ' questão(ões) com hash divergente'}.`);
