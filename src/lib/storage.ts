import type { AttemptRecord } from '../types';
import type { ErrorBook } from './errors';

const KEY = 'simulador-anbima:historico:v1';
const THEME_KEY = 'simulador-anbima:tema';

export function loadHistory(): AttemptRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as AttemptRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveAttempt(a: AttemptRecord): AttemptRecord[] {
  const next = [a, ...loadHistory()].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível: segue sem histórico */
  }
  return next;
}

const SEEN_KEY = 'simulador-anbima:ultima-prova:v1';

/** Ids, em ordem, da última prova gerada para a certificação (para não repetir questões nem ordem). */
export function loadLastExam(cert: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string[]>;
    return Array.isArray(all[cert]) ? all[cert] : [];
  } catch {
    return [];
  }
}

export function saveLastExam(cert: string, ids: string[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string[]>;
    all[cert] = ids;
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

const ERR_KEY = 'simulador-anbima:erros:v1';

export function loadErrors(): ErrorBook {
  try {
    const raw = localStorage.getItem(ERR_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && !Array.isArray(data)) return data as ErrorBook;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function saveErrors(book: ErrorBook): void {
  try {
    localStorage.setItem(ERR_KEY, JSON.stringify(book));
  } catch {
    /* ignore */
  }
}

export interface PlanPrefs {
  daysPerWeek: number;
  minutesPerDay: number;
  examDate: string;
}
const PLAN_KEY = 'simulador-anbima:plano:v1';
const DEFAULT_PREFS: PlanPrefs = { daysPerWeek: 5, minutesPerDay: 60, examDate: '' };

export function loadPlanPrefs(): PlanPrefs {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PlanPrefs>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

export function savePlanPrefs(p: PlanPrefs): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function loadTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveTheme(t: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
}

/** Substitui o histórico local (usado ao juntar com o histórico do banco). */
export function saveHistory(list: AttemptRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

/* ───────────── Limpar histórico ───────────── */

const CLEARED_KEY = 'simulador-anbima:historico-limpo-em:v1';
export const CYCLE_KEY = 'simulador-anbima:ciclo-feito:v1';

/** Momento (ISO) da última limpeza: tentativas do banco anteriores a ele não voltam ao juntar o histórico. */
export function loadClearedAt(): string | null {
  try {
    return localStorage.getItem(CLEARED_KEY);
  } catch {
    return null;
  }
}

/**
 * Apaga, neste navegador, tudo o que vem dos simulados: histórico (Seu histórico e Meu desempenho),
 * caderno de erros (Treino focado), rotina e ciclo do Plano de estudos e a última prova sorteada.
 * Tema e conta continuam.
 */
export function clearStudyData(now: Date = new Date()): void {
  try {
    for (const k of [KEY, ERR_KEY, PLAN_KEY, SEEN_KEY, CYCLE_KEY]) localStorage.removeItem(k);
    localStorage.setItem(CLEARED_KEY, now.toISOString());
  } catch {
    /* ignore */
  }
}

/** Etapas do ciclo marcadas como estudadas, por certificação. */
export function loadCycleDone(cert: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(CYCLE_KEY) ?? '{}') as Record<string, string[]>;
    return Array.isArray(all[cert]) ? all[cert] : [];
  } catch {
    return [];
  }
}

export function saveCycleDone(cert: string, topics: string[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(CYCLE_KEY) ?? '{}') as Record<string, string[]>;
    all[cert] = topics;
    localStorage.setItem(CYCLE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
