import type { Cert, Mode } from '../types';

export interface ErrorEntry {
  cert: Cert;
  wrongCount: number;
  lastWrong: string;
}
/** Caderno de erros: id da questão → quantas vezes errou. */
export type ErrorBook = Record<string, ErrorEntry>;

export interface QuestionResult {
  id: string;
  cert: Cert;
  correct: boolean;
}

/**
 * Errou: entra (ou soma) no caderno. Acertou em treino ou revisão de erros: sai do caderno.
 * Acertar dentro de uma prova completa não tira a questão (pode ter sido chute).
 */
export function applyResults(book: ErrorBook, results: readonly QuestionResult[], mode: Mode, nowIso: string): ErrorBook {
  const next: ErrorBook = { ...book };
  for (const r of results) {
    if (!r.correct) {
      const cur = next[r.id];
      next[r.id] = { cert: r.cert, wrongCount: (cur?.wrongCount ?? 0) + 1, lastWrong: nowIso };
    } else if (mode !== 'prova' && next[r.id]) {
      delete next[r.id];
    }
  }
  return next;
}

export function errorIds(book: ErrorBook, cert: Cert): string[] {
  return Object.entries(book)
    .filter(([, e]) => e.cert === cert)
    .sort((a, b) => b[1].wrongCount - a[1].wrongCount) // os que mais errou primeiro
    .map(([id]) => id);
}
