import type { Answers, Cert, ExamConfig, GradeResult, Question } from '../types';

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

export function buildExam(
  cfg: ExamConfig,
  bank: readonly Question[],
  rng: () => number = Math.random,
): Question[] {
  const pool = bank.filter((q) => q.cert === cfg.cert);
  const size = examSize(cfg, pool.length);
  return shuffle(pool, rng).slice(0, size).map((q) => shuffleOptions(q, rng));
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
