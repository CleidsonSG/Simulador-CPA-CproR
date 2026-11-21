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
