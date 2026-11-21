import type { AttemptRecord } from '../types';

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
