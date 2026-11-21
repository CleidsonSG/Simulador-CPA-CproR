import type { Cert, Question } from '../types';
import { SAMPLE_QUESTIONS } from './sampleQuestions';

export interface QuestionBank {
  questions: Question[];
  /** true enquanto o banco real (Supabase) não estiver ligado. */
  isSample: boolean;
}

/**
 * Ponto único de acesso às questões. Hoje devolve as de exemplo; quando o
 * Supabase estiver ligado, troque o corpo por uma consulta à tabela `questions`
 * (ver supabase/migrations/0001_init.sql) filtrando `year >= 2026`.
 */
export async function loadQuestions(cert: Cert): Promise<QuestionBank> {
  await new Promise((r) => setTimeout(r, 350)); // simula rede; mostra o esqueleto
  return { questions: SAMPLE_QUESTIONS.filter((q) => q.cert === cert), isSample: true };
}
