import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answers, ExamConfig, Question } from '../types';
import { formatClock } from '../lib/exam';

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  minutes: number;
  isSample: boolean;
  onFinish: (answers: Answers, usedSeconds: number) => void;
  onExit: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Quiz({ cfg, questions, minutes, isSample, onFinish, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [left, setLeft] = useState(minutes * 60);
  const answersRef = useRef<Answers>({});
  const doneRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = minutes * 60;
  const q = questions[index];
  const chosen = answers[q.id];
  const answered = chosen !== undefined;
  const isLast = index === questions.length - 1;

  const finish = useCallback(
    (remaining: number) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onFinish(answersRef.current, total - remaining);
    },
    [onFinish, total],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          queueMicrotask(() => finish(0));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [finish]);

  const choose = (i: number) => {
    if (answered) return;
    answersRef.current = { ...answersRef.current, [q.id]: i };
    setAnswers(answersRef.current);
    window.setTimeout(() => nextRef.current?.focus(), 50);
  };

  const next = () => {
    if (isLast) finish(left);
    else setIndex(index + 1);
  };

  const urgent = left <= 300;

  return (
    <div className="quiz">
      <div className="quiz-head">
        <div>
          <strong>
            Questão {index + 1} de {questions.length}
          </strong>
          <span className="muted small"> · {cfg.label}</span>
        </div>
        <div className={urgent ? 'timer timer-urgent' : 'timer'} role="timer" aria-label="Tempo restante">
          ⏱ {formatClock(left)}
        </div>
      </div>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={Object.keys(answers).length}
        aria-label="Questões respondidas"
      >
        <span style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }} />
      </div>

      {isSample && (
        <div className="banner banner-info">Questões de exemplo (banco real ainda não carregado).</div>
      )}

      <article className="card q-card" key={q.id}>
        <div className="q-meta">
          <span className="tag">{q.topic}</span>
          <span className="tag tag-soft">{q.difficulty}</span>
        </div>
        <h2 className="q-statement">{q.statement}</h2>

        <div className="options" role="radiogroup" aria-label="Alternativas">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correctIndex;
            const isChosen = i === chosen;
            let cls = 'option';
            if (answered && isCorrect) cls += ' is-correct';
            else if (answered && isChosen) cls += ' is-wrong';
            else if (answered) cls += ' is-dim';
            return (
              <button
                key={i}
                role="radio"
                aria-checked={isChosen}
                className={cls}
                disabled={answered}
                onClick={() => choose(i)}
              >
                <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
                <span className="opt-text">{opt}</span>
                {answered && isCorrect && <span className="mark" aria-label="Resposta correta">✓</span>}
                {answered && isChosen && !isCorrect && <span className="mark" aria-label="Sua resposta, incorreta">✗</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div
            className={chosen === q.correctIndex ? 'feedback feedback-ok' : 'feedback feedback-bad'}
            role="status"
            aria-live="polite"
          >
            {chosen === q.correctIndex ? (
              <strong>✓ Você acertou!</strong>
            ) : (
              <>
                <strong>✗ Você errou.</strong>
                <p>
                  Resposta correta: <b>{LETTERS[q.correctIndex]}</b>
                </p>
                <p className="explain">{q.explanation}</p>
              </>
            )}
          </div>
        )}
      </article>

      <div className="quiz-actions">
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (window.confirm('Sair do simulado? O progresso será perdido.')) onExit();
          }}
        >
          Sair
        </button>
        <button ref={nextRef} className="btn btn-primary" disabled={!answered} onClick={next}>
          {isLast ? 'Finalizar' : 'Próxima'}
        </button>
      </div>
    </div>
  );
}
