import { describe, expect, it } from 'vitest';
import { checkSets, parseEnv, validateQuestion, validateScenario } from './import-lib.mjs';

// Dados FICTÍCIOS: nunca colocar questões reais aqui (repositório público).
const ok = {
  source_code: 'X1', cert: 'CPA', topic: 'Tema', difficulty: 'Média', year: 2026,
  statement: 'Enunciado fictício', options: ['a', 'b', 'c', 'd'], correct_index: 2, pd_code: '2.1.1',
};

describe('validação da importação', () => {
  it('aceita questão válida', () => expect(validateQuestion(ok)).toEqual([]));
  it('recusa ano anterior a 2026, 3 alternativas e gabarito fora de 0–3', () => {
    const e = validateQuestion({ ...ok, year: 2025, options: ['a', 'b', 'c'], correct_index: 4 });
    expect(e).toHaveLength(3);
  });
  it('questão de conjunto precisa de cenário conhecido e posição 1/2', () => {
    expect(validateQuestion({ ...ok, scenario_code: 'S1', scenario_pos: 3 })).toHaveLength(2);
    expect(validateQuestion({ ...ok, scenario_code: 'S1', scenario_pos: 1 }, new Set(['S1']))).toEqual([]);
  });
  it('conjunto precisa das posições 1 e 2', () => {
    expect(checkSets([{ scenario_code: 'S', scenario_pos: 1 }])).toHaveLength(1);
    expect(checkSets([{ scenario_code: 'S', scenario_pos: 1 }, { scenario_code: 'S', scenario_pos: 2 }])).toEqual([]);
  });
  it('valida mapa e caso', () => {
    const mapa = { code: 'M', cert: 'CPRO_R', kind: 'mapa', year: 2026, body: { rootKey: 'a', nodes: { a: { client: 'Oi', options: [], next: [{ child: 'zz' }] } } } };
    expect(validateScenario(mapa)).toEqual(['nó a: child zz não existe']);
    expect(validateScenario({ code: 'C', cert: 'CPA', kind: 'caso', year: 2026, body: { html: '<p>x</p>' } })).toEqual([]);
    expect(validateScenario({ code: 'C', cert: 'CPA', kind: 'caso', year: 2026, body: {} })).toHaveLength(1);
  });
  it('lê .env simples', () => {
    expect(parseEnv('# comentário\nSUPABASE_URL="https://x.supabase.co"\nOUTRA=1')).toEqual({ SUPABASE_URL: 'https://x.supabase.co', OUTRA: '1' });
  });
});
