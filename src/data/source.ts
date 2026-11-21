import type { Cert, Question, Scenario } from '../types';
import { SAMPLE_QUESTIONS } from './sampleQuestions';
import { SAMPLE_SCENARIOS, SAMPLE_SCENARIO_QUESTIONS } from './sampleScenarios';
import { fetchBank } from './remote';
import { supabase } from '../lib/supabase';

export interface QuestionBank {
  /** Múltipla escolha + as 2 questões de cada conjunto (scenarioCode/scenarioPos). */
  questions: Question[];
  /** Mapas de decisão e casos (tabela question_scenarios). */
  scenarios: Scenario[];
  /** true quando são as questões de exemplo (sem Supabase ou sem login). */
  isSample: boolean;
}

export function sampleBank(cert: Cert): QuestionBank {
  return {
    questions: [...SAMPLE_QUESTIONS, ...SAMPLE_SCENARIO_QUESTIONS].filter((q) => q.cert === cert),
    scenarios: SAMPLE_SCENARIOS.filter((s) => s.cert === cert),
    isSample: true,
  };
}

/**
 * Ponto único de acesso às questões.
 *  - Supabase configurado e usuário logado: banco real (só `publicada`, `year >= 2026`; o RLS exige login).
 *  - Caso contrário: questões de exemplo do repositório (modo demonstração).
 * Erro de rede/banco é repassado para a tela mostrar o estado de erro.
 */
export async function loadQuestions(cert: Cert, signedIn = false): Promise<QuestionBank> {
  if (supabase && signedIn) {
    const bank = await fetchBank(supabase, cert);
    return { ...bank, isSample: false };
  }
  await new Promise((r) => setTimeout(r, 350)); // simula rede; mostra o esqueleto
  return sampleBank(cert);
}
