import type { Answers, Cert, ExamConfig, GradeResult, Question } from '../types';
import { MACROS, macroOf } from '../data/matrix';

/** Regras oficiais (Edital Anbima, rev. nov/2025): CPA 50q/70%, C-Pro R 45q/71%, 2h30. */
export const EXAMS: Record<Cert, ExamConfig> = {
  CPA: {
    cert: 'CPA',
    label: 'CPA',
    fullName: 'Certificação Profissional Anbima (CPA)',
    total: 50,
    passPct: 0.7,
    minutes: 150,
  },
  CPRO_R: {
    cert: 'CPRO_R',
    label: 'C-Pro R',
    fullName: 'Certificação Profissional Anbima de Relacionamento (C-Pro R)',
    total: 45,
    passPct: 0.71,
    minutes: 150,
  },
};

/** Quantas questões o simulado terá: o da prova real, ou menos se o banco for menor. */
export function examSize(cfg: ExamConfig, available: number): number {
  return Math.min(cfg.total, available);
}

/** Mínimo de acertos para aprovação (CPA 50→35; C-Pro R 45→32). */
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

/** Embaralha as alternativas mantendo o gabarito correto. */
export function shuffleOptions(q: Question, rng: () => number = Math.random): Question {
  const order = shuffle(q.options.map((_, i) => i), rng);
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

/**
 * Apresentação da questão. As questões da Anbima são mostradas EXATAMENTE como no original:
 * nem as alternativas mudam de posição. Só as demais (ia/exemplo) podem ter as alternativas embaralhadas.
 */
export function present(q: Question, rng: () => number = Math.random): Question {
  return q.source === 'anbima' ? q : shuffleOptions(q, rng);
}

export interface BuildOpts {
  /** Questões da tentativa anterior: só entram de novo se faltar questão nova. */
  recentIds?: ReadonlySet<string>;
  /** Ordem da tentativa anterior: a nova ordem nunca será idêntica a ela. */
  previousOrder?: readonly string[];
  rng?: () => number;
}

/**
 * Monta a prova de forma que todas as tentativas, de qualquer usuário, tenham a mesma "cara":
 *  - nº de questões por macrotema segue a proporção oficial do Programa Detalhado;
 *  - dentro do macrotema, os temas entram de forma proporcional;
 *  - questões da última tentativa ficam por último na fila de sorteio;
 *  - a ordem final é sempre embaralhada e diferente da anterior.
 * Técnica: cada questão recebe uma "hora de chegada" (posição na fila do macrotema ÷ cota do
 * macrotema); pegam-se as N primeiras. Resultado: cotas proporcionais, com o acaso decidindo quem entra.
 */
export function buildExam(cfg: ExamConfig, bank: readonly Question[], opts: BuildOpts = {}): Question[] {
  const rng = opts.rng ?? Math.random;
  const recent = opts.recentIds ?? new Set<string>();
  const pool = bank.filter((q) => q.cert === cfg.cert);
  const size = examSize(cfg, pool.length);
  if (size === 0) return [];

  const macros = new Map<number, Question[]>();
  for (const q of pool) {
    const m = macroOf(q.pdCode) ?? 0;
    macros.set(m, [...(macros.get(m) ?? []), q]);
  }
  const known = MACROS[cfg.cert];
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
  const chosen = keyed.sort((a, b) => a.key - b.key).slice(0, size).map((k) => k.q);

  let order = shuffle(chosen, rng);
  const prev = opts.previousOrder;
  for (let i = 0; i < 8 && prev && order.length > 1 && order.every((q, j) => q.id === prev[j]); i++) order = shuffle(chosen, rng);
  return order.map((q) => present(q, rng));
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
