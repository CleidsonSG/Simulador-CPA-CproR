import type { Cert, Question, Scenario } from '../types';
import { SAMPLE_QUESTIONS } from './sampleQuestions';
import { SAMPLE_SCENARIOS, SAMPLE_SCENARIO_QUESTIONS } from './sampleScenarios';

export interface QuestionBank {
  /** Múltipla escolha + as 2 questões de cada conjunto (scenarioCode/scenarioPos). */
  questions: Question[];
  /** Mapas de decisão e casos (tabela question_scenarios). */
  scenarios: Scenario[];
  /** true enquanto o banco real (Supabase) não estiver ligado. */
  isSample: boolean;
}

/**
 * Ponto único de acesso às questões. Hoje devolve as de exemplo; quando o
 * Supabase estiver ligado, troque o corpo por consultas às tabelas `questions`
 * e `question_scenarios` (ver supabase/migrations) filtrando `year >= 2026` e `status = 'publicada'`.
 */
export async function loadQuestions(cert: Cert): Promise<QuestionBank> {
  await new Promise((r) => setTimeout(r, 350)); // simula rede; mostra o esqueleto
  return {
    questions: [...SAMPLE_QUESTIONS, ...SAMPLE_SCENARIO_QUESTIONS].filter((q) => q.cert === cert),
    scenarios: SAMPLE_SCENARIOS.filter((s) => s.cert === cert),
    isSample: true,
  };
}
