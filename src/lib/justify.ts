import type { Question } from '../types';

const LETTERS = 'ABCDE';

export interface Justifications {
  /** Texto antes da primeira letra (às vezes vazio). */
  intro: string;
  /** Justificativa de cada alternativa, na ordem ORIGINAL do banco. */
  parts: string[];
}

/** Arruma o "(gabarito))" com parêntese duplo que vem do banco. */
export const tidyExplanation = (text: string) => text.replace(/\(\s*gabarito\s*\)\)+/gi, '(gabarito)');

/**
 * Separa a explicação no formato da Anbima ("A (gabarito)) … B) Incorreto. … C) … D) …") em um trecho
 * por alternativa. As letras precisam aparecer em ordem (A, B, C…), uma para cada alternativa;
 * se não, devolve null e a explicação é mostrada inteira.
 */
export function splitJustifications(text: string | undefined, n: number): Justifications | null {
  if (!text || n < 2 || n > LETTERS.length) return null;
  const starts: number[] = [];
  const ends: number[] = [];
  let pos = 0;
  for (let k = 0; k < n; k++) {
    // "A)", "A (gabarito))", "A) (gabarito)" — no início ou depois de espaço/pontuação
    const re = new RegExp(`(^|[\\s.;:!?])${LETTERS[k]}\\s*(?:\\)\\s*\\(\\s*[Gg]abarito\\s*\\)|\\(\\s*[Gg]abarito\\s*\\)\\)*|\\))`, 'g');
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) return null;
    starts.push(m.index + m[1].length);
    ends.push(m.index + m[0].length);
    pos = m.index + m[0].length;
  }
  const parts = ends.map((e, k) => text.slice(e, starts[k + 1] ?? text.length).replace(/^[\s:–—-]+/, '').trim());
  if (parts.some((p) => !p)) return null;
  return { intro: tidyExplanation(text.slice(0, starts[0]).trim()), parts };
}

/** A explicação cita alternativas pela letra ("B) …")? */
export const explanationUsesLetters = (text: string | undefined) => (text?.match(/(^|[\s.;:])[A-E]\s*\)/g)?.length ?? 0) >= 2;

/** Justificativas na ordem em que as alternativas aparecem na tela (já embaralhadas). */
export function shownJustifications(q: Pick<Question, 'explanation' | 'options' | 'optionOrder'>): { intro: string; byShown: string[] } | null {
  const j = splitJustifications(q.explanation, q.options.length);
  if (!j) return null;
  return { intro: j.intro, byShown: q.options.map((_, i) => j.parts[q.optionOrder?.[i] ?? i]) };
}
