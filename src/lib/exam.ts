import type { Answers, Cert, ExamConfig, GradeResult, Question, Scenario } from '../types';
import { MACROS, macroOf } from '../data/matrix';
import { explanationUsesLetters, splitJustifications } from './justify';

/** Regras oficiais (Edital Anbima, rev. nov/2025): CPA 50q/70%, C-Pro R 45q/71%, C-Pro I 40q/70%, 2h30. */
export const EXAMS: Record<Cert, ExamConfig> = {
  CPA: {
    cert: 'CPA',
    label: 'CPA',
    fullName: 'Certificação Profissional Anbima (CPA)',
    total: 50,
    passPct: 0.7,
    minutes: 150,
    sets: 5,
  },
  CPRO_R: {
    cert: 'CPRO_R',
    label: 'C-Pro R',
    fullName: 'Certificação Profissional Anbima de Relacionamento (C-Pro R)',
    total: 45,
    passPct: 0.71,
    minutes: 150,
    sets: 7,
  },
  CPRO_I: {
    cert: 'CPRO_I',
    label: 'C-Pro I',
    fullName: 'Certificação Profissional Anbima de Investimentos (C-Pro I)',
    total: 40,
    passPct: 0.7,
    minutes: 150,
    sets: 5,
  },
};

/** Quantas questões o simulado terá: o da prova real, ou menos se o banco for menor. */
export function examSize(cfg: ExamConfig, available: number): number {
  return Math.min(cfg.total, available);
}

/** Mínimo de acertos para aprovação (CPA 50→35; C-Pro R 45→32; C-Pro I 40→28). */
export function passMark(cfg: ExamConfig, size: number): number {
  return Math.ceil(Math.round(size * cfg.passPct * 1000) / 1000);
}

/** Tempo proporcional ao nº de questões (150 min para a prova completa). */
export function minutesFor(cfg: ExamConfig, size: number): number {
  return Math.max(1, Math.round((cfg.minutes * size) / cfg.total));
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Embaralha as alternativas mantendo o gabarito correto (e anotando a ordem original em optionOrder). */
export function shuffleOptions(q: Question, rng: () => number = Math.random): Question {
  const order = shuffle(q.options.map((_, i) => i), rng);
  const base = q.optionOrder ?? q.options.map((_, i) => i);
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    optionOrder: order.map((i) => base[i]),
  };
}

/** Alternativa que cita outras pela letra ou pela posição ("todas as anteriores", "A e B"): a ordem importa. */
export function optionsReferToEachOther(options: readonly string[]): boolean {
  return options.some(
    (o) =>
      /\b(todas|nenhuma|ambas)\s+(as|das)\s+(alternativas\s+)?(anteriores|acima)/i.test(o) ||
      /\balternativas?\s+[A-D]\b/i.test(o) ||
      /\b[A-D]\s*(,|e|ou)\s*[A-D]\b/.test(o),
  );
}

/**
 * Apresentação da questão: as alternativas são embaralhadas SÓ na exibição; o banco continua intacto
 * (as questões da Anbima são imutáveis). Motivo: o portal da Anbima grava o gabarito sempre na
 * alternativa A — sem embaralhar, o aluno acertaria pelo padrão.
 * Exceções (mantêm a ordem original): alternativas que citam outras pela letra/posição, e explicação
 * que cita letras mas não dá para separar por alternativa (as letras dela ficariam trocadas).
 */
export function present(q: Question, rng: () => number = Math.random): Question {
  const lettered = explanationUsesLetters(q.explanation) && !splitJustifications(q.explanation, q.options.length);
  return optionsReferToEachOther(q.options) || lettered ? q : shuffleOptions(q, rng);
}

export interface BuildOpts {
  /** Questões da tentativa anterior: só entram de novo se faltar questão nova. */
  recentIds?: ReadonlySet<string>;
  /** Ordem da tentativa anterior: a nova ordem nunca será idêntica a ela. */
  previousOrder?: readonly string[];
  /** Mapas de decisão e casos disponíveis (as 2 questões de cada um vêm em `bank`). */
  scenarios?: readonly Scenario[];
  rng?: () => number;
}

export interface ExamSet {
  scenario: Scenario;
  /** As 2 questões do conjunto, na ordem (scenarioPos 1 e 2). */
  questions: [Question, Question];
}

/** Conjuntos completos da certificação: cenário + exatamente as questões de posição 1 e 2. */
export function completeSets(cert: Cert, bank: readonly Question[], scenarios: readonly Scenario[]): ExamSet[] {
  const byCode = new Map<string, Question[]>();
  for (const q of bank) {
    if (q.cert !== cert || !q.scenarioCode) continue;
    byCode.set(q.scenarioCode, [...(byCode.get(q.scenarioCode) ?? []), q]);
  }
  const out: ExamSet[] = [];
  for (const s of scenarios) {
    if (s.cert !== cert) continue;
    const qs = [...(byCode.get(s.code) ?? [])].sort((a, b) => (a.scenarioPos ?? 0) - (b.scenarioPos ?? 0));
    if (qs.length === 2 && qs[0].scenarioPos === 1 && qs[1].scenarioPos === 2) out.push({ scenario: s, questions: [qs[0], qs[1]] });
  }
  return out;
}

/**
 * Sorteio balanceado das questões de múltipla escolha:
 *  - nº de questões por macrotema segue a proporção oficial do Programa Detalhado;
 *  - dentro do macrotema, os temas entram de forma proporcional;
 *  - questões da última tentativa ficam por último na fila de sorteio.
 * Técnica: cada questão recebe uma "hora de chegada" (posição na fila do macrotema ÷ cota do
 * macrotema); pegam-se as N primeiras. Resultado: cotas proporcionais, com o acaso decidindo quem entra.
 */
function pickBalanced(cert: Cert, pool: readonly Question[], size: number, recent: ReadonlySet<string>, rng: () => number): Question[] {
  if (size <= 0) return [];
  const macros = new Map<number, Question[]>();
  for (const q of pool) {
    const m = macroOf(q.pdCode) ?? 0;
    macros.set(m, [...(macros.get(m) ?? []), q]);
  }
  const known = MACROS[cert];
  const share = (m: number) => (m === 0 ? (macros.size === 1 ? 1 : 0.25) : (known.find((k) => k.id === m)?.share ?? 0.25));

  const keyed: { q: Question; key: number }[] = [];
  for (const [m, qs] of macros) {
    // 1) fila por tema: não vistas primeiro, depois sorteio
    const byTopic = new Map<string, Question[]>();
    for (const q of qs) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    const rated: { q: Question; r: number }[] = [];
    for (const list of byTopic.values()) {
      const ordered = shuffle(list, rng).sort((a, b) => Number(recent.has(a.id)) - Number(recent.has(b.id)));
      ordered.forEach((q, i) => rated.push({ q, r: (i + 1 - rng()) / list.length }));
    }
    // 2) fila do macrotema: não vistas primeiro; temas misturados na proporção do tamanho de cada um
    rated.sort((a, b) => Number(recent.has(a.q.id)) - Number(recent.has(b.q.id)) || a.r - b.r);
    rated.forEach(({ q }, i) => keyed.push({ q, key: (i + 1 - rng()) / (size * share(m)) }));
  }
  return keyed.sort((a, b) => a.key - b.key).slice(0, size).map((k) => k.q);
}

/**
 * Monta a prova de forma que todas as tentativas, de qualquer usuário, tenham a mesma "cara":
 *  - sorteia `cfg.sets` conjuntos (mapas/casos) completos, priorizando os não vistos na última tentativa;
 *  - completa o total da prova com múltipla escolha balanceada (total − 2 × conjuntos);
 *    se faltarem conjuntos no banco, a múltipla escolha cobre a diferença;
 *  - cada conjunto é um bloco contíguo (questão 1 e depois a 2); os blocos são embaralhados com as demais;
 *  - a ordem final é sempre diferente da anterior.
 */
export function buildExam(cfg: ExamConfig, bank: readonly Question[], opts: BuildOpts = {}): Question[] {
  const rng = opts.rng ?? Math.random;
  const recent = opts.recentIds ?? new Set<string>();

  const seen = (s: ExamSet) => s.questions.some((q) => recent.has(q.id));
  const sets = shuffle(completeSets(cfg.cert, bank, opts.scenarios ?? []), rng)
    .sort((a, b) => Number(seen(a)) - Number(seen(b)))
    .slice(0, cfg.sets);

  const mcPool = bank.filter((q) => q.cert === cfg.cert && !q.scenarioCode);
  const mcSize = examSize({ ...cfg, total: Math.max(0, cfg.total - 2 * sets.length) }, mcPool.length);
  const mc = pickBalanced(cfg.cert, mcPool, mcSize, recent, rng);

  const blocks: Question[][] = [...mc.map((q) => [q]), ...sets.map((s) => [...s.questions])];
  if (blocks.length === 0) return [];
  let order = shuffle(blocks, rng).flat();
  const prev = opts.previousOrder;
  for (let i = 0; i < 8 && prev && blocks.length > 1 && order.every((q, j) => q.id === prev[j]); i++) order = shuffle(blocks, rng).flat();
  return order.map((q) => present(q, rng));
}

/** Índices (início e fim, inclusivos) do bloco de conjunto que contém a questão `index`; null se for múltipla escolha. */
export function setRange(questions: readonly Question[], index: number): { start: number; end: number } | null {
  const code = questions[index]?.scenarioCode;
  if (!code) return null;
  let start = index;
  let end = index;
  while (start > 0 && questions[start - 1].scenarioCode === code) start--;
  while (end < questions.length - 1 && questions[end + 1].scenarioCode === code) end++;
  return { start, end };
}

/** Sorteia até `count` questões (todas, se count for omitido) e embaralha as alternativas. */
export function pickQuestions(pool: readonly Question[], count?: number, rng: () => number = Math.random): Question[] {
  const n = count === undefined ? pool.length : Math.min(count, pool.length);
  return shuffle(pool, rng).slice(0, n).map((q) => present(q, rng));
}

export function grade(questions: readonly Question[], answers: Answers): GradeResult {
  const topics = new Map<string, { correct: number; total: number }>();
  let correct = 0;
  for (const q of questions) {
    const t = topics.get(q.topic) ?? { correct: 0, total: 0 };
    t.total += 1;
    if (answers[q.id] === q.correctIndex) {
      t.correct += 1;
      correct += 1;
    }
    topics.set(q.topic, t);
  }
  const total = questions.length;
  return {
    correct,
    total,
    pct: total === 0 ? 0 : correct / total,
    byTopic: [...topics.entries()]
      .map(([topic, v]) => ({ topic, ...v }))
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}
