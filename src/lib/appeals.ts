// Recursos (contestação de questões). Espelha as regras do banco (supabase/migrations/0002).
export const APPEAL_CATEGORIES = [
  { id: 'gabarito_incorreto', label: 'Gabarito incorreto' },
  { id: 'duas_corretas', label: 'Mais de uma alternativa correta' },
  { id: 'nenhuma_correta', label: 'Nenhuma alternativa correta' },
  { id: 'enunciado_ambiguo', label: 'Enunciado ambíguo' },
  { id: 'desatualizada', label: 'Desatualizada em relação à norma' },
  { id: 'outro', label: 'Outro motivo' },
] as const;

export type AppealCategory = (typeof APPEAL_CATEGORIES)[number]['id'];

export interface Appeal {
  id: string;
  questionId: string;
  category: AppealCategory;
  argument: string;
  createdAt: string;
}

export const MIN_ARGUMENT = 20;
export const MAX_ARGUMENT = 1500;

/** Valores padrão de app_settings (recurso_limiar / recurso_confianca). */
export const QUARANTINE_THRESHOLD = 3;
export const QUARANTINE_CONFIDENCE = 0.7;

export function validateAppeal(category: string, argument: string): string | null {
  if (!APPEAL_CATEGORIES.some((c) => c.id === category)) return 'Escolha o motivo do recurso.';
  const len = argument.trim().length;
  if (len < MIN_ARGUMENT) return `Explique com pelo menos ${MIN_ARGUMENT} caracteres.`;
  if (len > MAX_ARGUMENT) return `Máximo de ${MAX_ARGUMENT} caracteres.`;
  return null;
}

export interface Decision {
  userId: string;
  verdict: 'deferido' | 'indeferido' | 'inconclusivo';
  confidence: number;
}

/** Quarentena: ≥ limiar de recursos deferidos, de usuários distintos, cada um com confiança ≥ mínima. */
export function shouldQuarantine(
  decisions: Decision[],
  threshold = QUARANTINE_THRESHOLD,
  minConfidence = QUARANTINE_CONFIDENCE,
): boolean {
  const users = new Set(
    decisions.filter((d) => d.verdict === 'deferido' && d.confidence >= minConfidence).map((d) => d.userId),
  );
  return users.size >= threshold;
}

const KEY = 'simulador-anbima:recursos:v1';

export function loadAppeals(): Appeal[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function hasAppeal(questionId: string): boolean {
  return loadAppeals().some((a) => a.questionId === questionId);
}

/** Guarda localmente (fila); será enviado ao Supabase quando houver login. Um recurso por questão. */
export function saveAppeal(questionId: string, category: AppealCategory, argument: string): string | null {
  const err = validateAppeal(category, argument);
  if (err) return err;
  if (hasAppeal(questionId)) return 'Você já enviou um recurso para esta questão.';
  const list = loadAppeals();
  list.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    questionId,
    category,
    argument: argument.trim(),
    createdAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return 'Não foi possível salvar neste navegador.';
  }
  return null;
}
