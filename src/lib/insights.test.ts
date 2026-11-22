import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../types';
import { sortTopics, summarize, toStats } from './analysis';
import { afterClear } from './sync';

const att = (id: string, correct: number, total: number, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
  id, cert: 'CPA', date: `2026-11-${id.padStart(2, '0')}T12:00:00Z`, correct, total, passMark: Math.ceil(total * 0.7),
  passed: correct >= Math.ceil(total * 0.7), ...extra,
});

describe('indicadores do desempenho', () => {
  it('sem simulados: tudo zerado', () => {
    expect(summarize([])).toMatchObject({ count: 0, delta: null, secPerQuestion: null });
  });
  it('média, melhor, último, variação, aprovação e tempo por questão', () => {
    const s = summarize([att('1', 30, 50, { usedSeconds: 3000 }), att('2', 40, 50, { usedSeconds: 2000 }), att('3', 35, 50)]);
    expect(s.count).toBe(3);
    expect(s.avg).toBeCloseTo(0.7);
    expect(s.best).toBeCloseTo(0.8);
    expect(s.last).toBeCloseTo(0.7);
    expect(s.delta).toBeCloseTo(-0.1);
    expect(s.passRate).toBeCloseTo(2 / 3);
    expect(s.secPerQuestion).toBeCloseTo(50); // 5000 s / 100 questões com tempo
  });
});

describe('lista de temas', () => {
  const stats = toStats(
    [
      { topic: 'Bancos', correct: 9, total: 10 },
      { topic: 'Ações', correct: 2, total: 8 },
      { topic: 'Fundos', correct: 6, total: 10 },
    ],
    ['Câmbio'],
  );
  it('mais fracos primeiro, temas sem dados no fim', () => {
    expect(sortTopics(stats, 'fraco').map((s) => s.topic)).toEqual(['Ações', 'Fundos', 'Bancos', 'Câmbio']);
  });
  it('por volume e em ordem alfabética', () => {
    expect(sortTopics(stats, 'volume')[0].topic).toMatch(/Bancos|Fundos/);
    expect(sortTopics(stats, 'az').map((s) => s.topic)).toEqual(['Ações', 'Bancos', 'Câmbio', 'Fundos']);
  });
  it('filtra por nível (sem dados não entra)', () => {
    expect(sortTopics(stats, 'fraco', 'critico').map((s) => s.topic)).toEqual(['Ações']);
    expect(sortTopics(stats, 'fraco', 'atencao').map((s) => s.topic)).toEqual(['Fundos']);
  });
});

describe('limpar histórico', () => {
  it('tentativas do banco anteriores à limpeza não voltam', () => {
    const remote = [att('1', 30, 50), att('20', 30, 50)];
    expect(afterClear(remote, '2026-11-10T00:00:00Z').map((a) => a.id)).toEqual(['20']);
    expect(afterClear(remote, null)).toHaveLength(2);
  });
});

describe('questões por macrotema (resumo do plano)', () => {
  it('peso oficial × total, somando o total da prova', async () => {
    const { questionsPerMacro } = await import('../data/matrix');
    expect(questionsPerMacro('CPRO_R', 45).map((r) => r.questions)).toEqual([9, 9, 18, 9]);
    expect(questionsPerMacro('CPA', 50).map((r) => r.questions)).toEqual([10, 20, 15, 5]);
    expect(questionsPerMacro('CPRO_I', 40).map((r) => r.questions)).toEqual([16, 6, 10, 8]);
    expect(questionsPerMacro('CPRO_R', 45).map((r) => r.macro.short)).toEqual(['Prospecção e relacionamento', 'Análise do cliente', 'Indicação de investimentos', 'Portfólio e monitoramento']);
    for (const n of [7, 13, 33]) expect(questionsPerMacro('CPRO_I', n).reduce((a, r) => a + r.questions, 0)).toBe(n);
  });
});

describe('resultado por macrotema', () => {
  it('agrupa pelo código do PD, conta acertos e lista só as erradas respondidas', async () => {
    const { macroBreakdown } = await import('./analysis');
    const mk = (id: string, pd: string | undefined, topic: string, correctIndex = 0) =>
      ({ id, cert: 'CPA', topic, pdCode: pd, difficulty: 'Média', year: 2026, statement: id, options: ['a', 'b', 'c', 'd'], correctIndex, explanation: '', source: 'anbima', sourceCode: id }) as import('../types').Question;
    const qs = [mk('1', '2.1.1', 'Renda fixa'), mk('2', '2.1.1', 'Renda fixa'), mk('3', '2.3.1', 'Fundos'), mk('4', '1.2.1', 'Política monetária'), mk('5', undefined, 'Sem PD')];
    const r = macroBreakdown('CPA', qs, { '1': 0, '2': 1, '4': 0 }); // 3 e 5 em branco
    expect(r.map((m) => [m.id, m.n, m.c])).toEqual([[1, 1, 1], [2, 3, 1], [0, 1, 0]]);
    expect(r[1].name).toBe('Produtos do mercado financeiro');
    const rf = r[1].topics.find((t) => t.topic === 'Renda fixa')!;
    expect([rf.n, rf.c, rf.wrong.map((q) => q.id)]).toEqual([2, 1, ['2']]);
    expect(r[1].topics.find((t) => t.topic === 'Fundos')!.wrong).toEqual([]); // em branco não entra
    expect(r[2].name).toBe('Outros temas');
  });
});
