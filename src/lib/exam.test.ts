import { describe, expect, it } from 'vitest';
import { EXAMS, buildExam, examSize, formatClock, grade, minutesFor, passMark, shuffleOptions } from './exam';
import type { Question } from '../types';

const mk = (id: string, cert: Question['cert'], topic = 'T'): Question => ({
  id,
  cert,
  topic,
  difficulty: 'Média',
  year: 2026,
  statement: `Enunciado ${id}`,
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 1,
  explanation: 'x',
});

describe('regras oficiais', () => {
  it('CPA: 50 questões, 35 acertos', () => {
    expect(passMark(EXAMS.CPA, 50)).toBe(35);
  });
  it('C-Pro R: 45 questões, 32 acertos', () => {
    expect(passMark(EXAMS.CPRO_R, 45)).toBe(32);
  });
  it('escala a nota de corte e o tempo quando o banco é menor', () => {
    expect(passMark(EXAMS.CPA, 10)).toBe(7);
    expect(minutesFor(EXAMS.CPA, 50)).toBe(150);
    expect(minutesFor(EXAMS.CPA, 10)).toBe(30);
  });
  it('não passa do tamanho da prova real', () => {
    expect(examSize(EXAMS.CPA, 500)).toBe(50);
    expect(examSize(EXAMS.CPRO_R, 12)).toBe(12);
  });
});

describe('montagem e correção', () => {
  it('embaralhar alternativas preserva a resposta correta', () => {
    const q = mk('1', 'CPA');
    for (let i = 0; i < 50; i++) {
      const s = shuffleOptions(q);
      expect(s.options[s.correctIndex]).toBe('b');
    }
  });
  it('buildExam só usa a certificação pedida', () => {
    const bank = [mk('1', 'CPA'), mk('2', 'CPA'), mk('3', 'CPRO_R')];
    const exam = buildExam(EXAMS.CPA, bank);
    expect(exam).toHaveLength(2);
    expect(exam.every((q) => q.cert === 'CPA')).toBe(true);
  });
  it('grade conta acertos por tópico', () => {
    const qs = [mk('1', 'CPA', 'A'), mk('2', 'CPA', 'A'), mk('3', 'CPA', 'B')];
    const r = grade(qs, { '1': 1, '2': 0 });
    expect(r.correct).toBe(1);
    expect(r.total).toBe(3);
    expect(r.byTopic.find((t) => t.topic === 'A')).toEqual({ topic: 'A', correct: 1, total: 2 });
  });
  it('formata o relógio', () => {
    expect(formatClock(9000)).toBe('02:30:00');
    expect(formatClock(-5)).toBe('00:00:00');
  });
});
