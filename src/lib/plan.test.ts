import { describe, expect, it } from 'vitest';
import { EXAMS } from './exam';
import { levelOf, pace, readiness, toStats } from './analysis';
import { allocate, buildPlan } from './plan';
import type { AttemptRecord } from '../types';

const stats = toStats(
  [
    { topic: 'Renda fixa', correct: 1, total: 4 },
    { topic: 'Fundos', correct: 3, total: 4 },
    { topic: 'Ética', correct: 2, total: 4 },
  ],
  ['Previdência'],
);

describe('análise', () => {
  it('níveis: <50 crítico, 50–69 atenção, ≥70 bom', () => {
    expect(levelOf(0.49)).toBe('critico');
    expect(levelOf(0.5)).toBe('atencao');
    expect(levelOf(0.7)).toBe('ok');
  });
  it('ordena do mais fraco ao mais forte e marca tema sem dados', () => {
    expect(stats[0].topic).toBe('Renda fixa');
    expect(stats.find((s) => s.topic === 'Previdência')?.known).toBe(false);
  });
  it('prontidão exige 3 simulados', () => {
    const mk = (c: number): AttemptRecord => ({ id: String(c), cert: 'CPA', date: '', correct: c, total: 50, passMark: 35, passed: c >= 35 });
    expect(readiness([mk(40), mk(30)], 'CPA', 0.7).state).toBe('poucos-dados');
    expect(readiness([mk(40), mk(38), mk(39)], 'CPA', 0.7).state).toBe('acima');
    expect(readiness([mk(20), mk(22), mk(21)], 'CPA', 0.7).state).toBe('abaixo');
  });
  it('ritmo: 150 min / 50 q = 180 s por questão', () => {
    const p = pace(9000, 50, 150, 50);
    expect(p.allowed).toBe(180);
    expect(p.ratio).toBeCloseTo(1);
  });
});

describe('plano de estudos', () => {
  it('a soma dos blocos é exatamente o tempo disponível e o tema mais fraco ganha mais tempo', () => {
    const blocks = allocate(stats, 240);
    expect(blocks.reduce((s, b) => s + b.minutes, 0)).toBe(240);
    expect(blocks[0].topic).toBe('Renda fixa');
    expect(blocks[0].minutes).toBeGreaterThan(blocks[blocks.length - 1].minutes);
  });
  it('semana: dias de estudo + último dia de simulado, sem estourar o limite diário', () => {
    const plan = buildPlan({ cfg: EXAMS.CPA, stats, daysPerWeek: 5, minutesPerDay: 90 });
    expect(plan.week).toHaveLength(5);
    expect(plan.week[4].kind).toBe('simulado');
    expect(plan.week.every((d) => d.minutes <= 90)).toBe(true);
    const studied = plan.week.flatMap((d) => d.slots).reduce((s, x) => s + x.minutes, 0);
    expect(studied).toBe(plan.topicMinutes);
  });
  it('fases com data da prova terminam na data da prova', () => {
    const exam = '2027-03-10';
    const plan = buildPlan({ cfg: EXAMS.CPRO_R, stats, daysPerWeek: 4, minutesPerDay: 60, examDate: exam, today: new Date(2026, 10, 21) });
    const last = plan.phases[plan.phases.length - 1];
    expect(last.name).toBe('Reta final');
    expect(last.to?.getFullYear()).toBe(2027);
    expect(last.to?.getMonth()).toBe(2);
    expect(last.to?.getDate()).toBe(10);
    expect(plan.weeksLeft).toBeGreaterThan(10);
  });
  it('data já passada gera aviso e fases genéricas', () => {
    const plan = buildPlan({ cfg: EXAMS.CPA, stats, daysPerWeek: 3, minutesPerDay: 60, examDate: '2020-01-01', today: new Date(2026, 10, 21) });
    expect(plan.weeksLeft).toBeNull();
    expect(plan.warnings.some((w) => w.includes('já passou'))).toBe(true);
  });
});
