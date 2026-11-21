import type { Answers, ExamConfig, Question } from '../types';
import { formatClock, grade, passMark } from '../lib/exam';

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  answers: Answers;
  usedSeconds: number;
  isSample: boolean;
  size: number;
  onRetry: () => void;
  onHome: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Result({ cfg, questions, answers, usedSeconds, isSample, size, onRetry, onHome }: Props) {
  const g = grade(questions, answers);
  const mark = passMark(cfg, size);
  const passed = g.correct >= mark;
  const wrong = questions.filter((q) => answers[q.id] !== q.correctIndex);

  return (
    <div className="result">
      <section className={passed ? 'card score score-ok' : 'card score score-bad'} aria-live="polite">
        <p className="muted small">{cfg.label} · tempo usado {formatClock(usedSeconds)}</p>
        <div className="score-num">
          {g.correct}
          <span>/{g.total}</span>
        </div>
        <p className="verdict">{passed ? '✓ Aprovado' : '✗ Reprovado'}</p>
        <p className="muted">
          Nota de corte: {mark} acertos ({Math.round(cfg.passPct * 100)}%). Você fez {Math.round(g.pct * 100)}%.
        </p>
        {isSample && <p className="small muted">Resultado com questões de exemplo.</p>}
      </section>

      <section className="card" aria-labelledby="topics-title">
        <h2 id="topics-title">Desempenho por tema</h2>
        <ul className="topics">
          {g.byTopic.map((t) => {
            const pct = Math.round((t.correct / t.total) * 100);
            const weak = pct < 60;
            return (
              <li key={t.topic}>
                <div className="topic-row">
                  <span>{t.topic}</span>
                  <span>
                    {t.correct}/{t.total} · {pct}% {weak ? '⚠' : ''}
                  </span>
                </div>
                <div className={weak ? 'bar bar-weak' : 'bar'} aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="rev-title">
        <h2 id="rev-title">Revisão dos erros ({wrong.length})</h2>
        {wrong.length === 0 ? (
          <div className="empty-inline">
            <p>Você não errou nenhuma questão. Excelente!</p>
          </div>
        ) : (
          <ol className="review">
            {wrong.map((q) => {
              const mine = answers[q.id];
              return (
                <li key={q.id}>
                  <p className="q-statement small-q">{q.statement}</p>
                  <p>
                    <span className="tag tag-bad">
                      Sua resposta: {mine === undefined ? 'em branco' : `${LETTERS[mine]}. ${q.options[mine]}`}
                    </span>
                  </p>
                  <p>
                    <span className="tag tag-ok">
                      Correta: {LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}
                    </span>
                  </p>
                  <p className="explain">{q.explanation}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="quiz-actions">
        <button className="btn" onClick={onHome}>Início</button>
        <button className="btn btn-primary" onClick={onRetry}>Novo simulado</button>
      </div>
    </div>
  );
}
