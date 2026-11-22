import type { SupabaseClient } from '@supabase/supabase-js';
import type { Answers, AttemptRecord, Cert, GradeResult, Question, TopicScore } from '../types';

/*
 * Envio ao Supabase com fila local ("caixa de saída"): a prova e os recursos são gravados primeiro no
 * navegador e enviados quando houver login e internet. Os ids são gerados aqui, então reenviar é seguro
 * (insert ... on conflict do nothing).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${'89ab'[Math.floor(Math.random() * 4)]}${h().slice(1)}-${h()}${h()}${h()}`;
}

export interface AttemptRow {
  id: string;
  cert: Cert;
  started_at: string;
  finished_at: string;
  used_seconds: number;
  correct: number;
  total: number;
  pass_mark: number;
  passed: boolean;
}
export interface AnswerRow {
  attempt_id: string;
  question_id: string;
  chosen_index: number | null;
  is_correct: boolean;
}
export interface AppealRow {
  question_id: string;
  cert: Cert;
  category: string;
  argument: string;
  chosen_index: number | null;
}

export type OutboxItem =
  | { kind: 'attempt'; userId: string; attempt: AttemptRow; answers: AnswerRow[] }
  | { kind: 'appeal'; userId: string; appeal: AppealRow };

/** Monta as linhas de attempts/attempt_answers. Só questões do banco (uuid) entram; exemplos nunca vão. */
export function buildAttempt(
  id: string,
  cert: Cert,
  questions: readonly Question[],
  answers: Answers,
  g: GradeResult,
  mark: number,
  usedSeconds: number,
  finishedAt: Date,
): { attempt: AttemptRow; answers: AnswerRow[] } {
  return {
    attempt: {
      id,
      cert,
      started_at: new Date(finishedAt.getTime() - usedSeconds * 1000).toISOString(),
      finished_at: finishedAt.toISOString(),
      used_seconds: usedSeconds,
      correct: g.correct,
      total: g.total,
      pass_mark: mark,
      passed: g.correct >= mark,
    },
    answers: questions
      .filter((q) => isUuid(q.id))
      .map((q) => ({
        attempt_id: id,
        question_id: q.id,
        chosen_index: originalIndex(q, answers[q.id]),
        is_correct: answers[q.id] === q.correctIndex,
      })),
  };
}

/** Resposta no índice do banco (a tela pode mostrar as alternativas em outra ordem). */
export function originalIndex(q: Pick<Question, 'optionOrder'>, shown: number | undefined): number | null {
  if (shown === undefined || shown === null) return null;
  return q.optionOrder?.[shown] ?? shown;
}

const KEY = 'simulador-anbima:caixa-de-saida:v1';

export function loadOutbox(): OutboxItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* sem armazenamento: o envio fica só na memória desta sessão */
  }
}
export function enqueue(item: OutboxItem): void {
  saveOutbox([...loadOutbox(), item]);
}

/** Erros que nunca vão passar (dado inválido/duplicado) saem da fila; erros de rede ficam para depois. */
export function isPermanent(code: string | undefined): boolean {
  return !!code && ['23505', '23514', '23502', '22P02', '42501'].includes(code);
}

async function send(sb: SupabaseClient, item: OutboxItem): Promise<void> {
  if (item.kind === 'attempt') {
    const a = await sb.from('attempts').upsert(item.attempt, { onConflict: 'id', ignoreDuplicates: true });
    if (a.error) throw a.error;
    if (item.answers.length) {
      const b = await sb.from('attempt_answers').upsert(item.answers, { onConflict: 'attempt_id,question_id', ignoreDuplicates: true });
      if (b.error) throw b.error;
    }
  } else {
    const r = await sb.from('appeals').insert(item.appeal);
    if (r.error && r.error.code !== '23505') throw r.error; // 23505 = já existe recurso deste usuário
  }
}

/** Envia o que estiver na fila do usuário logado. Devolve quantos foram enviados e quantos ficaram. */
export async function flushOutbox(sb: SupabaseClient, userId: string): Promise<{ sent: number; left: number }> {
  const items = loadOutbox();
  const keep: OutboxItem[] = [];
  let sent = 0;
  for (const item of items) {
    if (item.userId !== userId) {
      keep.push(item);
      continue;
    }
    try {
      await send(sb, item);
      sent++;
    } catch (e) {
      if (!isPermanent((e as { code?: string }).code)) keep.push(item);
    }
  }
  saveOutbox(keep);
  return { sent, left: keep.filter((i) => i.userId === userId).length };
}

/* ───────────── Histórico vindo do banco (outros aparelhos) ───────────── */

/** Converte tentativas + respostas do banco em registros do histórico, com desempenho por tema. */
export function toAttemptRecords(
  attempts: readonly AttemptRow[],
  answers: readonly Pick<AnswerRow, 'attempt_id' | 'question_id' | 'is_correct'>[],
  topicById: ReadonlyMap<string, string>,
): AttemptRecord[] {
  return attempts.map((a) => {
    const topics = new Map<string, TopicScore>();
    for (const ans of answers) {
      if (ans.attempt_id !== a.id) continue;
      const topic = topicById.get(ans.question_id) ?? 'Questão retirada';
      const t = topics.get(topic) ?? { topic, correct: 0, total: 0 };
      t.total++;
      if (ans.is_correct) t.correct++;
      topics.set(topic, t);
    }
    return {
      id: a.id,
      cert: a.cert,
      date: a.finished_at ?? a.started_at,
      correct: a.correct,
      total: a.total,
      passMark: a.pass_mark,
      passed: a.passed,
      usedSeconds: a.used_seconds ?? undefined,
      byTopic: topics.size ? [...topics.values()].sort((x, y) => x.correct / x.total - y.correct / y.total) : undefined,
    };
  });
}

/** Junta histórico local e do banco (mesmo id = mesma prova), do mais novo ao mais antigo. */
export function mergeHistory(local: readonly AttemptRecord[], remote: readonly AttemptRecord[], limit = 50): AttemptRecord[] {
  const byId = new Map<string, AttemptRecord>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) byId.set(l.id, { ...byId.get(l.id), ...l }); // o local tem byTopic completo
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export async function fetchRemoteHistory(sb: SupabaseClient): Promise<AttemptRecord[]> {
  const at = await sb
    .from('attempts')
    .select('id,cert,started_at,finished_at,used_seconds,correct,total,pass_mark,passed')
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(50);
  if (at.error) throw at.error;
  const attempts = (at.data ?? []) as AttemptRow[];
  if (attempts.length === 0) return [];
  const an = await sb.from('attempt_answers').select('attempt_id,question_id,is_correct').in('attempt_id', attempts.map((a) => a.id));
  if (an.error) throw an.error;
  const answers = (an.data ?? []) as AnswerRow[];
  const ids = [...new Set(answers.map((a) => a.question_id))];
  const topicById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const qs = await sb.from('questions').select('id,topic').in('id', ids.slice(i, i + 200));
    if (qs.error) throw qs.error;
    for (const q of qs.data ?? []) topicById.set(q.id as string, q.topic as string);
  }
  return toAttemptRecords(attempts, answers, topicById);
}
