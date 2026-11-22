import type { AttemptRecord, Cert, TopicScore } from '../types';

export type Level = 'critico' | 'atencao' | 'ok';

export const LEVEL_LABEL: Record<Level, string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  ok: 'Bom',
};

/** Abaixo de 50% = crítico; 50–69% = atenção; 70% ou mais = bom (nível da nota de corte). */
export function levelOf(acc: number): Level {
  if (acc < 0.5) return 'critico';
  if (acc < 0.7) return 'atencao';
  return 'ok';
}

export interface TopicStat extends TopicScore {
  acc: number;
  level: Level;
  /** false quando ainda não há nenhuma questão respondida do tema. */
  known: boolean;
}

/** Soma o desempenho por tema e ordena do mais fraco ao mais forte. */
export function toStats(scores: readonly TopicScore[], allTopics: readonly string[] = []): TopicStat[] {
  const map = new Map<string, TopicScore>();
  for (const s of scores) {
    const cur = map.get(s.topic) ?? { topic: s.topic, correct: 0, total: 0 };
    cur.correct += s.correct;
    cur.total += s.total;
    map.set(s.topic, cur);
  }
  for (const t of allTopics) if (!map.has(t)) map.set(t, { topic: t, correct: 0, total: 0 });
  return [...map.values()]
    .map((s) => {
      const known = s.total > 0;
      const acc = known ? s.correct / s.total : 0.5;
      return { ...s, acc, known, level: (known ? levelOf(acc) : 'atencao') as Level };
    })
    .sort((a, b) => a.acc - b.acc || b.total - a.total || a.topic.localeCompare(b.topic));
}

export function aggregateTopics(history: readonly AttemptRecord[], cert: Cert): TopicScore[] {
  return history.filter((h) => h.cert === cert).flatMap((h) => h.byTopic ?? []);
}

export type ReadyState = 'poucos-dados' | 'abaixo' | 'perto' | 'acima';

/**
 * Indicador simples de prontidão: média dos 3 últimos simulados contra a nota de corte.
 * Não é previsão de aprovação — depende da qualidade e da quantidade dos simulados.
 */
export function readiness(
  history: readonly AttemptRecord[],
  cert: Cert,
  passPct: number,
): { state: ReadyState; avg: number; n: number } {
  const last = history.filter((h) => h.cert === cert).slice(0, 3); // histórico vem do mais novo ao mais antigo
  if (last.length < 3) return { state: 'poucos-dados', avg: 0, n: last.length };
  const avg = last.reduce((s, h) => s + h.correct / h.total, 0) / last.length;
  const diff = avg - passPct;
  return { state: diff >= 0.05 ? 'acima' : diff >= -0.05 ? 'perto' : 'abaixo', avg, n: last.length };
}

export const READY_TEXT: Record<ReadyState, string> = {
  'poucos-dados': 'Faça pelo menos 3 simulados para ver o indicador.',
  abaixo: 'Média dos 3 últimos simulados abaixo da nota de corte.',
  perto: 'Média dos 3 últimos simulados perto da nota de corte (±5 pontos).',
  acima: 'Média dos 3 últimos simulados acima da nota de corte.',
};

/** Tempo médio por questão (s) e limite da prova real (s). */
export function pace(usedSeconds: number, answered: number, examMinutes: number, examTotal: number) {
  const perQuestion = answered > 0 ? usedSeconds / answered : 0;
  const allowed = (examMinutes * 60) / examTotal;
  return { perQuestion, allowed, ratio: allowed > 0 ? perQuestion / allowed : 0 };
}

export interface Summary {
  count: number;
  avg: number;
  best: number;
  last: number;
  /** Diferença entre o último e o penúltimo simulado (pontos percentuais em fração). null com 1 simulado. */
  delta: number | null;
  /** Fração de simulados aprovados. */
  passRate: number;
  /** Segundos por questão, em média (só simulados que guardaram o tempo). null sem dado. */
  secPerQuestion: number | null;
}

/** Indicadores do painel, a partir dos simulados do mais antigo ao mais novo. */
export function summarize(attempts: readonly AttemptRecord[]): Summary {
  const n = attempts.length;
  if (n === 0) return { count: 0, avg: 0, best: 0, last: 0, delta: null, passRate: 0, secPerQuestion: null };
  const p = attempts.map((a) => (a.total ? a.correct / a.total : 0));
  const timed = attempts.filter((a) => (a.usedSeconds ?? 0) > 0 && a.total > 0);
  return {
    count: n,
    avg: p.reduce((s, x) => s + x, 0) / n,
    best: Math.max(...p),
    last: p[n - 1],
    delta: n > 1 ? p[n - 1] - p[n - 2] : null,
    passRate: attempts.filter((a) => a.passed).length / n,
    secPerQuestion: timed.length
      ? timed.reduce((s, a) => s + (a.usedSeconds ?? 0), 0) / timed.reduce((s, a) => s + a.total, 0)
      : null,
  };
}

export type TopicSort = 'fraco' | 'volume' | 'az';

/** Ordena e filtra os temas para a lista interativa de "Onde melhorar". */
export function sortTopics(stats: readonly TopicStat[], sort: TopicSort, level: Level | 'todos' = 'todos'): TopicStat[] {
  const list = stats.filter((s) => level === 'todos' || (s.known && s.level === level));
  if (sort === 'az') return [...list].sort((a, b) => a.topic.localeCompare(b.topic, 'pt-BR'));
  if (sort === 'volume') return [...list].sort((a, b) => b.total - a.total || a.acc - b.acc);
  return [...list].sort((a, b) => Number(b.known) - Number(a.known) || a.acc - b.acc || b.total - a.total);
}
