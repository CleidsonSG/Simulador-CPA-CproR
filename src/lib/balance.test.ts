import { describe, expect, it } from 'vitest';
import { EXAMS, buildExam } from './exam';
import { MACROS, macroOf, topicWeights } from '../data/matrix';
import type { Question } from '../types';

/** Banco fictício: 200 questões CPA distribuídas nos 4 macrotemas, 5 temas por macrotema. */
function bank(source: Question['source'] = 'anbima'): Question[] {
  const perMacro: Record<number, number> = { 1: 40, 2: 80, 3: 60, 4: 20 };
  const out: Question[] = [];
  for (const [m, n] of Object.entries(perMacro)) {
    for (let i = 0; i < n; i++) {
      out.push({
        id: `m${m}-${i}`, cert: 'CPA', topic: `T${m}.${i % 5}`, pdCode: `${m}.${(i % 5) + 1}`, difficulty: 'Média', year: 2026,
        statement: `q ${m}-${i}`, options: ['A1', 'B2', 'C3', 'D4'], correctIndex: i % 4, explanation: '', source,
      });
    }
  }
  return out;
}

const count = (qs: Question[]) => {
  const c: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  qs.forEach((q) => (c[macroOf(q.pdCode)!] += 1));
  return c;
};

describe('prova balanceada', () => {
  it('toda tentativa segue a proporção oficial do PD (20/40/30/10%) e tem 50 questões', () => {
    const b = bank();
    for (let i = 0; i < 200; i++) {
      const exam = buildExam(EXAMS.CPA, b);
      expect(exam).toHaveLength(50);
      expect(new Set(exam.map((q) => q.id)).size).toBe(50);
      const c = count(exam);
      expect(Math.abs(c[1] - 10)).toBeLessThanOrEqual(2);
      expect(Math.abs(c[2] - 20)).toBeLessThanOrEqual(2);
      expect(Math.abs(c[3] - 15)).toBeLessThanOrEqual(2);
      expect(Math.abs(c[4] - 5)).toBeLessThanOrEqual(2);
    }
  });

  it('não repete questões da tentativa anterior quando há questões novas suficientes', () => {
    const b = bank();
    let prev = buildExam(EXAMS.CPA, b);
    for (let i = 0; i < 50; i++) {
      const next = buildExam(EXAMS.CPA, b, { recentIds: new Set(prev.map((q) => q.id)), previousOrder: prev.map((q) => q.id) });
      const ids = new Set(prev.map((q) => q.id));
      expect(next.filter((q) => ids.has(q.id)).length).toBeLessThanOrEqual(3); // folga de arredondamento da cota
      prev = next;
    }
  });

  it('a ordem muda a cada tentativa', () => {
    const b = bank();
    const a = buildExam(EXAMS.CPA, b).map((q) => q.id).join();
    const c = buildExam(EXAMS.CPA, b).map((q) => q.id).join();
    expect(a).not.toBe(c);
  });

  it('com banco pequeno, repete só o necessário e nunca passa do banco', () => {
    const small = bank().slice(0, 12);
    const exam = buildExam(EXAMS.CPA, small, { recentIds: new Set(small.map((q) => q.id)) });
    expect(exam).toHaveLength(12);
  });

  it('questões da Anbima mantêm as alternativas EXATAMENTE como no original', () => {
    const b = bank('anbima');
    for (let i = 0; i < 100; i++) {
      for (const q of buildExam(EXAMS.CPA, b)) expect(q.options).toEqual(['A1', 'B2', 'C3', 'D4']);
    }
  });

  it('questões de exemplo/IA podem ter as alternativas embaralhadas, sem perder o gabarito', () => {
    const b = bank('exemplo');
    let moved = false;
    for (let i = 0; i < 30; i++) {
      for (const q of buildExam(EXAMS.CPA, b)) {
        const original = b.find((x) => x.id === q.id)!;
        expect(q.options[q.correctIndex]).toBe(original.options[original.correctIndex]);
        if (q.options.join() !== original.options.join()) moved = true;
      }
    }
    expect(moved).toBe(true);
  });
});

describe('proporções oficiais', () => {
  it('somam 100% nas duas provas', () => {
    for (const cert of ['CPA', 'CPRO_R', 'CPRO_I'] as const) {
      expect(MACROS[cert].reduce((s, m) => s + m.share, 0)).toBeCloseTo(1);
    }
    expect(MACROS.CPA.map((m) => m.share)).toEqual([0.2, 0.4, 0.3, 0.1]);
    expect(MACROS.CPRO_R.map((m) => m.share)).toEqual([0.2, 0.2, 0.4, 0.2]);
    expect(MACROS.CPRO_I.map((m) => m.share)).toEqual([0.4, 0.15, 0.25, 0.2]);
  });
  it('macroOf lê o 1º número do código do PD', () => {
    expect(macroOf('2.1.3')).toBe(2);
    expect(macroOf('4')).toBe(4);
    expect(macroOf('9.1')).toBeUndefined();
    expect(macroOf(undefined)).toBeUndefined();
  });
  it('peso por tema: macrotema com mais peso e menos temas pesa mais por tema', () => {
    const w = topicWeights('CPA', [
      { topic: 'a', pdCode: '2.1' }, { topic: 'b', pdCode: '4.1' }, { topic: 'c', pdCode: '4.2' }, { topic: 'sem', pdCode: undefined },
    ]);
    expect(w.a).toBeCloseTo(0.4);
    expect(w.b).toBeCloseTo(0.05);
    expect(w.sem).toBeGreaterThan(0);
  });
});
