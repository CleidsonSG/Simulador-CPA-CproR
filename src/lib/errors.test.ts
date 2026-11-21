import { describe, expect, it } from 'vitest';
import { applyResults, errorIds, type ErrorBook } from './errors';
import { allocate } from './plan';
import { pickQuestions } from './exam';
import { toStats } from './analysis';
import type { Question } from '../types';

const NOW = '2026-11-21T00:00:00.000Z';

describe('caderno de erros', () => {
  it('erro entra e soma; acerto em treino tira; acerto em prova não tira', () => {
    let book: ErrorBook = {};
    book = applyResults(book, [{ id: 'a', cert: 'CPA', correct: false }], 'prova', NOW);
    book = applyResults(book, [{ id: 'a', cert: 'CPA', correct: false }], 'treino', NOW);
    expect(book.a.wrongCount).toBe(2);
    book = applyResults(book, [{ id: 'a', cert: 'CPA', correct: true }], 'prova', NOW);
    expect(book.a).toBeDefined();
    book = applyResults(book, [{ id: 'a', cert: 'CPA', correct: true }], 'erros', NOW);
    expect(book.a).toBeUndefined();
  });
  it('lista por certificação, mais errados primeiro', () => {
    const book: ErrorBook = {
      x: { cert: 'CPA', wrongCount: 1, lastWrong: NOW },
      y: { cert: 'CPA', wrongCount: 3, lastWrong: NOW },
      z: { cert: 'CPRO_R', wrongCount: 9, lastWrong: NOW },
    };
    expect(errorIds(book, 'CPA')).toEqual(['y', 'x']);
  });
  it('não altera o objeto original', () => {
    const book: ErrorBook = { a: { cert: 'CPA', wrongCount: 1, lastWrong: NOW } };
    applyResults(book, [{ id: 'a', cert: 'CPA', correct: true }], 'treino', NOW);
    expect(book.a).toBeDefined();
  });
});

describe('treino e pesos', () => {
  const q = (id: string): Question => ({ id, cert: 'CPA', topic: 'T', difficulty: 'Baixa', year: 2026, statement: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '' });
  it('pickQuestions respeita o limite e mantém o gabarito', () => {
    const r = pickQuestions([q('1'), q('2'), q('3')], 2);
    expect(r).toHaveLength(2);
    r.forEach((x) => expect(x.options[x.correctIndex]).toBe('a'));
    expect(pickQuestions([q('1')], 10)).toHaveLength(1);
  });
  it('peso do tema aumenta o tempo e a soma continua exata', () => {
    const stats = toStats([
      { topic: 'A', correct: 2, total: 4 },
      { topic: 'B', correct: 2, total: 4 },
    ]);
    const base = allocate(stats, 120);
    const heavy = allocate(stats, 120, { B: 2 });
    expect(base.find((b) => b.topic === 'A')?.minutes).toBe(base.find((b) => b.topic === 'B')?.minutes);
    expect(heavy.find((b) => b.topic === 'B')!.minutes).toBeGreaterThan(heavy.find((b) => b.topic === 'A')!.minutes);
    expect(heavy.reduce((s, b) => s + b.minutes, 0)).toBe(120);
  });
});
