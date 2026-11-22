// Validação das questões de TREINO criadas por IA (agentes) e geração do SQL de importação.
// REGRA DO PROJETO: questão de IA vai só para public.training_questions (Treino focado), sempre em revisão.
// Nunca para public.questions (oficiais) e nunca para o simulado.

export const CERTS = ['CPA', 'CPRO_R', 'CPRO_I'];
export const DIFFS = ['Baixa', 'Média', 'Alta'];
/** Nº de macrotemas por certificação (Programas Detalhados 2026). */
const MACROS = { CPA: 4, CPRO_R: 4, CPRO_I: 4 };

/** Termos que o Guia de elaboração da Anbima proíbe nas alternativas (absolutos e remissivos). */
const ABSOLUTOS = /\b(sempre|nunca|tudo|todos|todas|completamente|totalmente|jamais)\b/i;
const REMISSIVAS = /\b(todas|nenhuma)\s+(as|das)\s+(alternativas\s+)?(anteriores|acima)|\b[A-D]\s*(e|ou)\s*[A-D]\b/i;
/** Enunciado na forma negativa (o Guia pede para evitar). */
const NEGATIVO = /\b(exceto|incorreta|incorreto|não\s+é\s+correto|não\s+está\s+correta|falsa)\b/i;

const semEspacos = (s) => String(s ?? '').replace(/\s+/g, '').length;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Valida uma questão. Devolve { erros, avisos }: erro impede a importação; aviso só alerta.
 * Formato esperado: { cert, pd_code, topic, difficulty, statement, options[4], correct_index, explanation, revisao }
 */
export function validarQuestao(q) {
  const erros = [];
  const avisos = [];
  if (!CERTS.includes(q.cert)) erros.push(`cert inválida: ${q.cert}`);
  if (!DIFFS.includes(q.difficulty)) erros.push(`difficulty inválida: ${q.difficulty}`);
  if (!q.topic?.trim()) erros.push('topic vazio');
  const pd = String(q.pd_code ?? '');
  const macro = Number(pd.split('.')[0]);
  if (!/^\d+(\.\d+)+$/.test(pd)) erros.push(`pd_code inválido: ${pd || '(vazio)'}`);
  else if (!(macro >= 1 && macro <= (MACROS[q.cert] ?? 0))) erros.push(`pd_code fora dos macrotemas da ${q.cert}: ${pd}`);
  if (!q.statement?.trim()) erros.push('statement vazio');
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length !== 4) erros.push('são exigidas exatamente 4 alternativas');
  if (opts.some((o) => !String(o ?? '').trim())) erros.push('alternativa vazia');
  if (new Set(opts.map(norm)).size !== opts.length) erros.push('alternativas repetidas');
  if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) erros.push('correct_index deve ser 0 a 3');
  opts.forEach((o, i) => {
    if (REMISSIVAS.test(o)) erros.push(`alternativa ${'ABCD'[i]} cita outras alternativas (proibido pelo Guia)`);
    if (ABSOLUTOS.test(o)) avisos.push(`alternativa ${'ABCD'[i]} usa termo absoluto (sempre/nunca/todos…)`);
  });
  if (NEGATIVO.test(q.statement ?? '')) avisos.push('enunciado na forma negativa (evitar, pelo Guia)');
  // Explicação por alternativa, na ordem do banco: "A) … B) … C) … D) …" (o app mostra cada uma na sua alternativa).
  const exp = String(q.explanation ?? '');
  const letras = ['A', 'B', 'C', 'D'].map((l) => new RegExp(`(^|[\\s.;:])${l}\\s*(\\(\\s*gabarito\\s*\\))?\\)`).exec(exp)?.index ?? -1);
  if (!exp.trim()) erros.push('explanation vazia');
  else if (letras.some((p) => p < 0) || letras.some((p, i) => i > 0 && p <= letras[i - 1])) {
    erros.push('explanation precisa justificar cada alternativa em ordem: "A) … B) … C) … D) …"');
  }
  // Tamanhos de referência do Guia (sem espaços): ~800 no contexto+comando e ~500 nas 4 alternativas.
  const tEnun = semEspacos(q.statement);
  const tAlts = opts.reduce((n, o) => n + semEspacos(o), 0);
  if (tEnun > 1400) avisos.push(`enunciado longo (${tEnun} caracteres sem espaço; referência ~800)`);
  if (tEnun < 120) avisos.push(`enunciado curto demais para ter contexto profissional (${tEnun} caracteres)`);
  if (tAlts > 800) avisos.push(`alternativas longas (${tAlts} caracteres sem espaço; referência ~500)`);
  const tamanhos = opts.map(semEspacos);
  if (opts.length === 4 && Math.max(...tamanhos) > 2.2 * Math.max(1, Math.min(...tamanhos))) {
    avisos.push('tamanhos das alternativas muito diferentes (a mais longa pode denunciar o gabarito)');
  }
  // Só entra no SQL o que o revisor independente aprovou.
  if (q.revisao?.veredito !== 'aprovada') erros.push('sem aprovação do revisor independente (revisao.veredito = "aprovada")');
  return { erros, avisos };
}

/** Valida um lote: cada questão + duplicatas no lote + distribuição do gabarito. */
export function validarLote(lote) {
  const itens = lote.map((q, i) => ({ i, ...validarQuestao(q) }));
  const vistos = new Map();
  lote.forEach((q, i) => {
    const k = norm(q.statement);
    if (vistos.has(k)) itens[i].erros.push(`enunciado repetido (igual à questão ${vistos.get(k) + 1} do lote)`);
    else vistos.set(k, i);
  });
  const dist = [0, 0, 0, 0];
  lote.forEach((q) => Number.isInteger(q.correct_index) && dist[q.correct_index]++);
  return { itens, dist, ok: itens.every((x) => x.erros.length === 0) };
}

/** Texto SQL seguro com dollar-quoting (o conteúdo não pode conter a tag). */
const dq = (s) => {
  const t = String(s);
  let tag = 'q';
  while (t.includes(`$${tag}$`)) tag += 'q';
  return `$${tag}$${t}$${tag}$`;
};

/** SQL de importação: só insert_generated_question, que grava em training_questions e em revisão. */
export function gerarSql(lote, origem = 'agente') {
  const linhas = [
    '-- Questões de TREINO criadas por IA. Rode no SQL Editor do Supabase logado como administrador.',
    '-- Vão para public.training_questions, em revisão. Publique uma a uma no painel/SQL com',
    '-- select public.publish_training_question(<id>, true);  — nunca entram no simulado.',
    'begin;',
  ];
  for (const q of lote) {
    linhas.push(
      `select public.insert_generated_question(${dq(q.cert)}, ${dq(q.pd_code)}, ${dq(q.topic)}, ${dq(q.difficulty)}, ${dq(q.statement)}, ` +
        `${dq(JSON.stringify(q.options))}::jsonb, ${q.correct_index}, ${dq(q.explanation)}, ${dq(origem)}, true);`,
    );
  }
  linhas.push('commit;', '');
  return linhas.join('\n');
}
