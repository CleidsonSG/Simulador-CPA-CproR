import { describe, expect, it } from 'vitest';
import { EXAMS, buildExam, completeSets, passMark, present, setRange } from './exam';
import type { Cert, Question, Scenario } from '../types';
import { SAMPLE_SCENARIOS, SAMPLE_SCENARIO_QUESTIONS } from '../data/sampleScenarios';
import { SAMPLE_QUESTIONS } from '../data/sampleQuestions';

/** Gerador determinístico (mulberry32) para testes reproduzíveis. */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const mc = (id: string, cert: Cert, pdCode: string): Question => ({
  id, cert, pdCode, topic: `T${pdCode[0]}`, difficulty: 'Média', year: 2026, statement: id,
  options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'x', source: 'anbima',
});

const scen = (code: string, cert: Cert, kind: 'mapa' | 'caso'): Scenario =>
  kind === 'mapa'
    ? { code, cert, kind, year: 2026, topic: 'T', title: code, source: 'anbima', body: { intro: '', pergunta: '', rootKey: 'r', nodes: {} } }
    : { code, cert, kind, year: 2026, topic: 'T', title: code, source: 'anbima', body: { html: '<p>x</p>' } };

const setQ = (code: string, cert: Cert, pos: number): Question => ({
  ...mc(`${code}-${pos}`, cert, '3.1'), scenarioCode: code, scenarioPos: pos, options: ['certa', 'b', 'c', 'd'],
});

/** Banco sintético: 60 MC nos 4 macrotemas + `nSets` conjuntos completos. */
function bank(cert: Cert, nSets: number) {
  const qs: Question[] = [];
  for (let i = 0; i < 60; i++) qs.push(mc(`${cert}-mc-${i}`, cert, `${(i % 4) + 1}.1`));
  const scenarios: Scenario[] = [];
  for (let s = 0; s < nSets; s++) {
    const code = `${cert}-S${s}`;
    scenarios.push(scen(code, cert, s % 2 ? 'caso' : 'mapa'));
    qs.push(setQ(code, cert, 1), setQ(code, cert, 2));
  }
  return { qs, scenarios };
}

describe('conjuntos (mapas e casos) na prova', () => {
  it.each([
    ['CPA', 5, 50],
    ['CPRO_R', 7, 45],
    ['CPRO_I', 5, 40],
  ] as const)('%s: %i conjuntos de 2 questões dentro das %i do total', (cert, sets, total) => {
    const { qs, scenarios } = bank(cert, 12);
    expect(EXAMS[cert].sets).toBe(sets);
    const exam = buildExam(EXAMS[cert], qs, { scenarios, rng: seeded(7) });
    expect(exam).toHaveLength(total);
    const codes = new Set(exam.map((q) => q.scenarioCode).filter(Boolean));
    expect(codes.size).toBe(sets);
    expect(exam.filter((q) => q.scenarioCode)).toHaveLength(2 * sets);
    expect(exam.filter((q) => !q.scenarioCode)).toHaveLength(total - 2 * sets);
    expect(passMark(EXAMS[cert], exam.length)).toBe({ CPA: 35, CPRO_R: 32, CPRO_I: 28 }[cert]);
  });

  it('cada conjunto é um bloco contíguo, com a questão 1 antes da 2', () => {
    const { qs, scenarios } = bank('CPRO_R', 9);
    for (let seed = 1; seed <= 30; seed++) {
      const exam = buildExam(EXAMS.CPRO_R, qs, { scenarios, rng: seeded(seed) });
      exam.forEach((q, i) => {
        if (q.scenarioPos === 1) {
          expect(exam[i + 1].scenarioCode).toBe(q.scenarioCode);
          expect(exam[i + 1].scenarioPos).toBe(2);
          expect(setRange(exam, i)).toEqual({ start: i, end: i + 1 });
          expect(setRange(exam, i + 1)).toEqual({ start: i, end: i + 1 });
        }
      });
    }
  });

  it('com poucos conjuntos no banco, a múltipla escolha completa o total', () => {
    const { qs, scenarios } = bank('CPA', 2);
    const exam = buildExam(EXAMS.CPA, qs, { scenarios, rng: seeded(3) });
    expect(exam).toHaveLength(50);
    expect(exam.filter((q) => q.scenarioCode)).toHaveLength(4);
  });

  it('conjunto incompleto (só 1 questão) ou de outra certificação não entra', () => {
    const qs = [mc('m1', 'CPA', '1.1'), setQ('INC', 'CPA', 1), setQ('OUT', 'CPRO_R', 1), setQ('OUT', 'CPRO_R', 2)];
    const scenarios = [scen('INC', 'CPA', 'caso'), scen('OUT', 'CPRO_R', 'caso')];
    expect(completeSets('CPA', qs, scenarios)).toHaveLength(0);
    expect(buildExam(EXAMS.CPA, qs, { scenarios }).map((q) => q.id)).toEqual(['m1']);
  });

  it('sem cenários, as questões de conjunto nunca entram soltas na múltipla escolha', () => {
    const { qs } = bank('CPA', 6);
    const exam = buildExam(EXAMS.CPA, qs, { rng: seeded(11) });
    expect(exam).toHaveLength(50);
    expect(exam.some((q) => q.scenarioCode)).toBe(false);
  });

  it('prioriza conjuntos não vistos na tentativa anterior', () => {
    const { qs, scenarios } = bank('CPA', 10);
    const first = buildExam(EXAMS.CPA, qs, { scenarios, rng: seeded(5) });
    const seen = new Set(first.map((q) => q.id));
    const firstSets = new Set(first.map((q) => q.scenarioCode).filter(Boolean));
    const second = buildExam(EXAMS.CPA, qs, { scenarios, recentIds: seen, rng: seeded(6) });
    const secondSets = new Set(second.map((q) => q.scenarioCode).filter(Boolean));
    expect([...secondSets].some((c) => firstSets.has(c))).toBe(false);
  });

  it('questão de conjunto da Anbima: embaralha só a exibição, mantendo o gabarito', () => {
    const q = setQ('X', 'CPA', 1);
    const seenPositions = new Set<number>();
    for (let s = 1; s < 40; s++) {
      const p = present(q, seeded(s));
      expect(p.options[p.correctIndex]).toBe('certa');
      seenPositions.add(p.correctIndex);
    }
    expect(seenPositions.size).toBeGreaterThan(1);
    expect(q.options[0]).toBe('certa'); // o original não muda
    const plain = mc('Y', 'CPA', '1.1');
    expect(present(plain)).toBe(plain); // MC da Anbima segue intocada
  });
});

/**
 * Quantidades do banco real em 21/11/2026 (só as contagens; nenhum conteúdo real).
 * Múltipla escolha por macrotema 1–4 e nº de conjuntos completos publicados.
 */
const REAL: Record<Cert, { mc: [number, number, number, number]; sets: number }> = {
  CPA: { mc: [22, 48, 36, 5], sets: 5 },
  CPRO_R: { mc: [5, 10, 23, 5], sets: 6 },
  CPRO_I: { mc: [22, 6, 16, 8], sets: 6 },
};

function realBank(cert: Cert) {
  const qs: Question[] = [];
  REAL[cert].mc.forEach((n, m) => {
    for (let i = 0; i < n; i++) qs.push(mc(`${cert}-m${m + 1}-${i}`, cert, `${m + 1}.${(i % 3) + 1}`));
  });
  const scenarios: Scenario[] = [];
  for (let s = 0; s < REAL[cert].sets; s++) {
    const code = `${cert}-R${s}`;
    scenarios.push(scen(code, cert, s % 2 ? 'caso' : 'mapa'));
    qs.push(setQ(code, cert, 1), setQ(code, cert, 2));
  }
  return { qs, scenarios };
}

describe('banco com as quantidades reais: repete entre provas, nunca dentro da mesma', () => {
  it.each(['CPA', 'CPRO_R', 'CPRO_I'] as const)('%s: 10 provas seguidas, todas completas e sem repetição interna', (cert) => {
    const cfg = EXAMS[cert];
    const { qs, scenarios } = realBank(cert);
    let last: string[] = [];
    let reused = 0;
    for (let t = 1; t <= 10; t++) {
      const exam = buildExam(cfg, qs, { scenarios, recentIds: new Set(last), previousOrder: last, rng: seeded(100 + t) });
      const ids = exam.map((q) => q.id);
      expect(exam).toHaveLength(cfg.total); // 50 / 45 / 40
      expect(new Set(ids).size).toBe(ids.length); // nenhuma questão duas vezes na mesma prova
      expect(new Set(exam.map((q) => q.scenarioCode).filter(Boolean)).size).toBe(Math.min(cfg.sets, REAL[cert].sets));
      reused += ids.filter((id) => last.includes(id)).length;
      last = ids;
    }
    // Banco pequeno: completar a prova exige reaproveitar questões das provas anteriores.
    expect(reused).toBeGreaterThan(0);
  });

  it('C-Pro R: com 6 conjuntos para 7, a múltipla escolha cobre (33 + 12 = 45)', () => {
    const { qs, scenarios } = realBank('CPRO_R');
    const exam = buildExam(EXAMS.CPRO_R, qs, { scenarios, rng: seeded(9) });
    expect(exam.filter((q) => !q.scenarioCode)).toHaveLength(33);
    expect(exam.filter((q) => q.scenarioCode)).toHaveLength(12);
  });

  it('macrotema com menos questões que a cota entra com todas as que tem; os outros completam', () => {
    const { qs, scenarios } = realBank('CPRO_R');
    for (let s = 1; s <= 10; s++) {
      const exam = buildExam(EXAMS.CPRO_R, qs, { scenarios, rng: seeded(s) });
      const m1 = exam.filter((q) => !q.scenarioCode && q.pdCode?.startsWith('1.')).length;
      expect(m1).toBe(5); // as 5 que existem (cota seria 6–7)
    }
  });

  it.each(['CPA', 'CPRO_R', 'CPRO_I'] as const)('%s: só repete questão de um macrotema depois de usar todas as novas dele', (cert) => {
    const { qs, scenarios } = realBank(cert);
    for (let s = 1; s <= 10; s++) {
      const first = buildExam(EXAMS[cert], qs, { scenarios, rng: seeded(s) });
      const seen = new Set(first.map((q) => q.id));
      const second = buildExam(EXAMS[cert], qs, { scenarios, recentIds: seen, rng: seeded(s + 50) });
      const inSecond = new Set(second.map((q) => q.id));
      for (const rep of second.filter((q) => !q.scenarioCode && seen.has(q.id))) {
        const macro = rep.pdCode!.split('.')[0];
        const freshSameMacro = qs.filter((q) => !q.scenarioCode && !seen.has(q.id) && q.pdCode!.split('.')[0] === macro);
        expect(freshSameMacro.every((q) => inSecond.has(q.id))).toBe(true);
      }
      // o mesmo vale para os conjuntos
      const repSets = new Set(second.filter((q) => q.scenarioCode && seen.has(q.id)).map((q) => q.scenarioCode));
      if (repSets.size) {
        const freshSets = scenarios.filter((sc) => !first.some((q) => q.scenarioCode === sc.code));
        expect(freshSets.every((sc) => second.some((q) => q.scenarioCode === sc.code))).toBe(true);
      }
    }
  });
});

describe('amostras de conjunto do repositório', () => {
  it('são de exemplo, completas e com 4 alternativas', () => {
    for (const s of SAMPLE_SCENARIOS) expect(s.source).toBe('exemplo');
    for (const q of SAMPLE_SCENARIO_QUESTIONS) {
      expect(q.source).toBe('exemplo');
      expect(q.options).toHaveLength(4);
    }
    for (const cert of ['CPA', 'CPRO_R', 'CPRO_I'] as const) {
      const sc = SAMPLE_SCENARIOS.filter((s) => s.cert === cert);
      expect(completeSets(cert, SAMPLE_SCENARIO_QUESTIONS, sc)).toHaveLength(sc.length);
    }
  });

  it('montam a prova de exemplo com os conjuntos disponíveis', () => {
    const exam = buildExam(EXAMS.CPRO_R, [...SAMPLE_QUESTIONS, ...SAMPLE_SCENARIO_QUESTIONS], { scenarios: SAMPLE_SCENARIOS, rng: seeded(2) });
    expect(new Set(exam.map((q) => q.scenarioCode).filter(Boolean)).size).toBe(4);
  });
});
