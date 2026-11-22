import { describe, expect, it } from 'vitest';
import { explanationUsesLetters, shownJustifications, splitJustifications, tidyExplanation } from './justify';
import { present } from './exam';
import type { Question } from '../types';

// Texto inventado no formato das explicações da Anbima (com o "(gabarito))" duplo). Nada do banco real.
const EXP =
  'A (gabarito)) Alfa explica o certo. B) Incorreto. Beta explica o erro. ' +
  'C) Incorreto. Gama explica (com parênteses). D) Incorreto. Delta explica.';
const qx: Question = {
  id: 'qx', cert: 'CPA', topic: 't', difficulty: 'Média', statement: 'Qual?', sourceCode: '999999', year: 2025, source: 'exemplo',
  options: ['alfa', 'beta', 'gama', 'delta'], correctIndex: 0, explanation: EXP,
};

describe('justificativa por alternativa', () => {
  it('separa a explicação da Anbima por letra', () => {
    const j = splitJustifications(EXP, 4)!;
    expect(j.intro).toBe('');
    expect(j.parts[0]).toMatch(/^Alfa/);
    expect(j.parts[2]).toMatch(/^Incorreto\. Gama.*parênteses\)\.$/);
    expect(j.parts[3]).toMatch(/^Incorreto\. Delta/);
  });

  it('acompanha o embaralhamento: cada alternativa fica com a sua justificativa', () => {
    // tela: A = gama, B = delta, C = alfa (gabarito), D = beta
    const shown: Question = { ...qx, options: ['gama', 'delta', 'alfa', 'beta'], correctIndex: 2, optionOrder: [2, 3, 0, 1] };
    const w = shownJustifications(shown)!;
    expect(w.byShown[0]).toMatch(/Gama/);
    expect(w.byShown[2]).toMatch(/Alfa/);
    expect(w.byShown[3]).toMatch(/Beta/);
    for (let i = 0; i < 20; i++) {
      const p = present(qx);
      expect(shownJustifications(p)!.byShown[p.correctIndex]).toMatch(/Alfa/);
    }
  });

  it('explicação sem letras ou fora do formato fica inteira', () => {
    expect(splitJustifications('O gabarito é a primeira porque…', 4)).toBeNull();
    expect(splitJustifications('A) só uma. B) e outra.', 4)).toBeNull();
    expect(tidyExplanation('A (gabarito)) texto')).toBe('A (gabarito) texto');
  });

  it('explicação que cita letras mas não separa não é embaralhada', () => {
    const odd: Question = { ...qx, explanation: 'A) certo. C) errado. B) errado.' };
    expect(explanationUsesLetters(odd.explanation)).toBe(true);
    for (let i = 0; i < 10; i++) expect(present(odd).options).toEqual(qx.options);
  });
});

import { SAMPLE_QUESTIONS } from '../data/sampleQuestions';
import { SAMPLE_SCENARIO_QUESTIONS } from '../data/sampleScenarios';

describe('questões de exemplo: justificativa por alternativa', () => {
  it('toda explicação que cita letras é separada certo por alternativa (e a CPA toda tem)', () => {
    for (const q of [...SAMPLE_QUESTIONS, ...SAMPLE_SCENARIO_QUESTIONS]) {
      if (!explanationUsesLetters(q.explanation)) continue;
      const j = splitJustifications(q.explanation, q.options.length);
      expect(j, q.id).not.toBeNull();
      expect(j!.parts[q.correctIndex], q.id).toMatch(/^Correta/);
      j!.parts.forEach((p, i) => i !== q.correctIndex && expect(p, `${q.id} ${'ABCD'[i]}`).toMatch(/^Incorreta/));
    }
    const cpa = SAMPLE_QUESTIONS.filter((q) => q.cert === 'CPA');
    expect(cpa).toHaveLength(10);
    for (const q of cpa) expect(splitJustifications(q.explanation, 4), q.id).not.toBeNull();
  });
});
