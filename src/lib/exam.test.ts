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
  source: 'exemplo',
});

describe('regras oficiais', () => {
  it('CPA: 50 questões, 35 acertos', () => {
    expect(passMark(EXAMS.CPA, 50)).toBe(35);
  });
  it('C-Pro R: 45 questões, 32 acertos', () => {
    expect(passMark(EXAMS.CPRO_R, 45)).toBe(32);
    expect(passMark(EXAMS.CPRO_I, 40)).toBe(28);
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

import { TRIAL, buildTrial } from './exam';
import { sampleBank } from '../data/source';

describe('degustação', () => {
  it('5 questões de múltipla escolha da CPA + 1 mapa completo no fim', () => {
    const b = sampleBank('CPA');
    for (let i = 0; i < 10; i++) {
      const qs = buildTrial(b.questions, b.scenarios);
      expect(qs).toHaveLength(TRIAL.mc + 2);
      expect(qs.every((q) => q.cert === 'CPA')).toBe(true);
      expect(qs.slice(0, 5).every((q) => !q.scenarioCode)).toBe(true);
      const [a, c] = qs.slice(5);
      expect(a.scenarioCode).toBeTruthy();
      expect(a.scenarioCode).toBe(c.scenarioCode);
      expect(b.scenarios.find((s) => s.code === a.scenarioCode)?.kind).toBe('mapa');
      expect([a.scenarioPos, c.scenarioPos]).toEqual([1, 2]);
    }
  });
});

describe('regra: questão de IA nunca entra no simulado', () => {
  it('buildExam, conjuntos e degustação ignoram source="ia", mesmo misturadas ao banco', () => {
    const b = sampleBank('CPA');
    // cópia "de IA" de todas as questões e cenários: se algo vazar, aparece no sorteio
    const ia = b.questions.map((q) => ({ ...q, id: `ia-${q.id}`, source: 'ia' as const, scenarioCode: q.scenarioCode && `IA-${q.scenarioCode}` }));
    const iaScen = b.scenarios.map((s) => ({ ...s, code: `IA-${s.code}`, source: 'ia' as const }));
    const bank = [...b.questions, ...ia];
    const scenarios = [...b.scenarios, ...iaScen];
    for (let i = 0; i < 30; i++) {
      const exam = buildExam(EXAMS.CPA, bank, { scenarios });
      expect(exam.length).toBeGreaterThan(0);
      expect(exam.some((q) => q.source === 'ia' || q.id.startsWith('ia-'))).toBe(false);
      expect(buildTrial(bank, scenarios).some((q) => q.source === 'ia')).toBe(false);
    }
    // só IA no banco: o simulado fica vazio em vez de usar IA
    expect(buildExam(EXAMS.CPA, ia, { scenarios: iaScen })).toEqual([]);
  });
});
