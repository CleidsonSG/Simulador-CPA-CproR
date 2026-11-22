import type { Question } from '../types';
import { shownJustifications, tidyExplanation } from '../lib/justify';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Explicação na correção comentada. Quando ela vem por letra (formato da Anbima), mostra cada
 * alternativa com a sua justificativa, com as letras da tela; assim nada fica trocado pelo embaralhamento.
 */
export function Explanation({ q, mine }: { q: Question; mine: number | undefined }) {
  const whys = shownJustifications(q);
  if (!whys) return <p className="explain">{tidyExplanation(q.explanation)}</p>;
  return (
    <>
      {whys.intro && <p className="explain">{whys.intro}</p>}
      <ul className="why-list">
        {q.options.map((opt, i) => {
          const ok = i === q.correctIndex;
          return (
            <li key={i} className={ok ? 'why-ok' : i === mine ? 'why-bad' : undefined}>
              <span className="why-head">
                <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
                <span>
                  {opt}
                  {ok && <b className="why-tag"> ✓ gabarito</b>}
                  {i === mine && !ok && <b className="why-tag"> ✗ sua resposta</b>}
                </span>
              </span>
              <span className="opt-why">{whys.byShown[i]}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
