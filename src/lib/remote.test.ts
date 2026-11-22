import { beforeEach, describe, expect, it } from 'vitest';
import { QUESTION_COLS, rowToQuestion, rowToScenario, trainingRowToQuestion, type QuestionRow, type ScenarioRow } from '../data/remote';
import { buildAttempt, enqueue, flushOutbox, isPermanent, isUuid, loadOutbox, mergeHistory, newId, originalIndex, toAttemptRecords } from './sync';
import { authMessage, validateCredentials } from './auth';
import { sanitizeHtml } from './scenario';
import { grade } from './exam';
import type { AttemptRecord, Question } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

// localStorage mínimo para o ambiente node.
const mem = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const qrow = (over: Partial<QuestionRow> = {}): QuestionRow => ({
  id: U(1), cert: 'CPA', topic: 'T', pd_code: '2.1.1', difficulty: 'Média', year: 2026, statement: 'E',
  options: ['a', 'b', 'c', 'd'], correct_index: 1, explanation: null, source: 'anbima', explanation_source: null,
  scenario_code: null, scenario_pos: null, ...over,
});

describe('linhas do banco → app', () => {
  it('converte questão e descarta inválidas', () => {
    expect(rowToQuestion(qrow())).toMatchObject({ id: U(1), correctIndex: 1, pdCode: '2.1.1', explanation: '' });
    expect(rowToQuestion(qrow({ source_code: '000084' }))?.sourceCode).toBe('000084');
    expect(rowToQuestion(qrow())?.sourceCode).toBeUndefined();
    expect(QUESTION_COLS.split(',')).toContain('source_code');
    expect(rowToQuestion(qrow({ options: ['a', 'b', 'c'] }))).toBeNull();
    expect(rowToQuestion(qrow({ year: 2025 }))).toBeNull();
    expect(rowToQuestion(qrow({ scenario_code: 'S1', scenario_pos: 2 }))).toMatchObject({ scenarioCode: 'S1', scenarioPos: 2 });
  });
  it('converte cenários e descarta corpo inválido', () => {
    const base: ScenarioRow = { code: '000140', cert: 'CPRO_R', kind: 'caso', year: 2026, topic: null, pd_code: null, body: { html: '<p>x</p>' }, source: 'anbima' };
    expect(rowToScenario(base)).toMatchObject({ kind: 'caso', title: 'Caso 000140' });
    expect(rowToScenario({ ...base, body: {} })).toBeNull();
    const mapa = { ...base, kind: 'mapa' as const, topic: 'Perfil', body: { intro: 'i', pergunta: 'p', rootKey: 'a', nodes: { a: { client: 'Oi', options: ['1'] } } } };
    const s = rowToScenario(mapa);
    expect(s?.kind === 'mapa' && s.body.nodes.a.next).toEqual([]);
    expect(s?.title).toBe('Perfil');
    expect(rowToScenario({ ...mapa, body: { rootKey: 'x', nodes: {} } })).toBeNull();
  });
});

describe('envio de tentativas e recursos', () => {
  beforeEach(() => mem.clear());

  const qs: Question[] = [rowToQuestion(qrow())!, rowToQuestion(qrow({ id: U(2) }))!, { ...rowToQuestion(qrow())!, id: 'ex-cpa-01' }];

  it('monta attempt e respostas só com questões do banco (uuid)', () => {
    const answers = { [U(1)]: 1, [U(2)]: 0, 'ex-cpa-01': 1 };
    const g = grade(qs, answers);
    const r = buildAttempt(U(9), 'CPA', qs, answers, g, 2, 60, new Date('2026-11-21T12:00:00Z'));
    expect(r.attempt).toMatchObject({ id: U(9), correct: 2, total: 3, pass_mark: 2, passed: true, started_at: '2026-11-21T11:59:00.000Z' });
    expect(r.answers.map((a) => [a.question_id, a.is_correct])).toEqual([[U(1), true], [U(2), false]]);
  });

  it('alternativas embaralhadas na tela: grava a resposta no índice do banco', () => {
    const shown: Question = { ...qs[0], options: ['d', 'a', 'c', 'b'], correctIndex: 1, optionOrder: [3, 0, 2, 1] };
    const r = buildAttempt(U(9), 'CPA', [shown], { [U(1)]: 1 }, grade([shown], { [U(1)]: 1 }), 1, 10, new Date());
    expect(r.answers[0]).toMatchObject({ chosen_index: 0, is_correct: true });
    expect(originalIndex(shown, 0)).toBe(3);
    expect(originalIndex(shown, undefined)).toBeNull();
    expect(originalIndex(qs[0], 2)).toBe(2); // sem embaralhar
  });

  it('newId gera uuid', () => expect(isUuid(newId())).toBe(true));

  /** Cliente falso que registra as chamadas e pode falhar. */
  const fake = (fail?: { code?: string; message: string }) => {
    const calls: string[] = [];
    const table = (name: string) => ({
      upsert: async () => (calls.push(`upsert:${name}`), { error: fail ?? null }),
      insert: async () => (calls.push(`insert:${name}`), { error: fail ?? null }),
    });
    return { calls, sb: { from: table } as unknown as SupabaseClient };
  };

  it('envia a fila do usuário e mantém a de outro usuário', async () => {
    const att = buildAttempt(U(9), 'CPA', qs, {}, grade(qs, {}), 2, 10, new Date());
    enqueue({ kind: 'attempt', userId: 'u1', ...att });
    enqueue({ kind: 'appeal', userId: 'u1', appeal: { question_id: U(1), cert: 'CPA', category: 'outro', argument: 'x'.repeat(25), chosen_index: 0 } });
    enqueue({ kind: 'appeal', userId: 'u2', appeal: { question_id: U(1), cert: 'CPA', category: 'outro', argument: 'x'.repeat(25), chosen_index: 0 } });
    const { sb, calls } = fake();
    expect(await flushOutbox(sb, 'u1')).toEqual({ sent: 2, left: 0 });
    expect(calls).toEqual(['upsert:attempts', 'upsert:attempt_answers', 'insert:appeals']);
    expect(loadOutbox().map((i) => i.userId)).toEqual(['u2']);
  });

  it('sem internet, mantém na fila; erro permanente sai da fila', async () => {
    enqueue({ kind: 'appeal', userId: 'u1', appeal: { question_id: U(1), cert: 'CPA', category: 'outro', argument: 'x'.repeat(25), chosen_index: null } });
    expect(await flushOutbox(fake({ message: 'Failed to fetch' }).sb, 'u1')).toEqual({ sent: 0, left: 1 });
    expect(await flushOutbox(fake({ code: '23514', message: 'check' }).sb, 'u1')).toEqual({ sent: 0, left: 0 });
    expect(isPermanent(undefined)).toBe(false);
  });

  it('recurso duplicado (23505) conta como enviado', async () => {
    enqueue({ kind: 'appeal', userId: 'u1', appeal: { question_id: U(1), cert: 'CPA', category: 'outro', argument: 'x'.repeat(25), chosen_index: null } });
    expect(await flushOutbox(fake({ code: '23505', message: 'dup' }).sb, 'u1')).toEqual({ sent: 1, left: 0 });
  });
});

describe('histórico do banco', () => {
  it('calcula desempenho por tema e junta com o local sem duplicar', () => {
    const remote = toAttemptRecords(
      [{ id: 'a1', cert: 'CPA', started_at: '2026-11-01T10:00:00Z', finished_at: '2026-11-01T12:00:00Z', used_seconds: 100, correct: 1, total: 2, pass_mark: 2, passed: false }],
      [{ attempt_id: 'a1', question_id: 'q1', is_correct: true }, { attempt_id: 'a1', question_id: 'q2', is_correct: false }],
      new Map([['q1', 'Renda fixa'], ['q2', 'Fundos']]),
    );
    expect(remote[0].byTopic).toEqual([{ topic: 'Fundos', correct: 0, total: 1 }, { topic: 'Renda fixa', correct: 1, total: 1 }]);
    const local: AttemptRecord = { id: 'a1', cert: 'CPA', date: '2026-11-01T12:00:00Z', correct: 1, total: 2, passMark: 2, passed: false };
    const newer: AttemptRecord = { ...local, id: 'a2', date: '2026-11-20T12:00:00Z' };
    const merged = mergeHistory([local, newer], remote);
    expect(merged.map((m) => m.id)).toEqual(['a2', 'a1']);
    expect(merged[1].byTopic).toHaveLength(2);
  });
});

describe('login', () => {
  it('valida e-mail e senha', () => {
    expect(validateCredentials('x', '12345678', 'entrar')).toMatch(/e-mail/);
    expect(validateCredentials('a@b.co', '123', 'criar')).toMatch(/8 caracteres/);
    expect(validateCredentials('a@b.co', '12345678', 'criar')).toBeNull();
  });
  it('traduz erros do Supabase', () => {
    expect(authMessage('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(authMessage('TypeError: Failed to fetch')).toMatch(/internet/);
    expect(authMessage('algo novo')).toMatch(/Tente de novo/);
  });
});

describe('imagens no texto do caso', () => {
  const P = 'https://abc.supabase.co/storage/v1/object/public/';
  it('aceita só imagens do Storage do projeto', () => {
    expect(sanitizeHtml(`<img src="${P}casos/g1.png" alt="Gráfico 1">`, P)).toBe(
      `<img src="${P}casos/g1.png" alt="Gráfico 1" loading="lazy" referrerpolicy="no-referrer">`,
    );
    expect(sanitizeHtml('<img src="https://evil.com/x.png">', P)).toBe('');
    expect(sanitizeHtml(`<img src="https://abc.supabase.co.evil.com/storage/v1/object/public/x.png">`, P)).toBe('');
    expect(sanitizeHtml(`<img src="${P}x.png" onerror="alert(1)">`, P)).not.toMatch(/onerror/);
    expect(sanitizeHtml(`<img src="${P}x.png">`)).toBe('');
  });
});

describe('questões de treino (IA)', () => {
  const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  it('linha de training_questions vira questão source=ia; inválida fica de fora', () => {
    const q = trainingRowToQuestion({ id: U(7), cert: 'CPA', topic: 'Renda fixa', pd_code: '2.1.1', difficulty: 'Média', statement: 'S?', options: ['a', 'b', 'c', 'd'], correct_index: 2, explanation: 'A) … B) … C) … D) …' });
    expect(q).toMatchObject({ source: 'ia', explanationSource: 'ia', correctIndex: 2, pdCode: '2.1.1' });
    expect(trainingRowToQuestion({ id: U(8), cert: 'CPA', topic: 'x', pd_code: null, difficulty: 'Média', statement: 'S', options: ['a', 'b'], correct_index: 0, explanation: 'e' })).toBeNull();
  });

  it('a tentativa enviada ao banco nunca leva resposta de questão de IA', () => {
    const oficial: Question = { id: U(1), cert: 'CPA', topic: 't', difficulty: 'Média', year: 2026, statement: 's', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', source: 'anbima' };
    const ia: Question = { ...oficial, id: U(2), source: 'ia' };
    const answers = { [U(1)]: 0, [U(2)]: 1 };
    const r = buildAttempt(U(9), 'CPA', [oficial, ia], answers, grade([oficial, ia], answers), 1, 60, new Date());
    expect(r.answers.map((a) => a.question_id)).toEqual([U(1)]);
  });
});
