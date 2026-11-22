import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answers, ExamConfig, Mode, Question, Scenario } from '../types';
import { formatClock, setRange } from '../lib/exam';
import { APPEAL_CATEGORIES, hasAppeal, saveAppeal } from '../lib/appeals';
import type { AppealCategory } from '../lib/appeals';
import { CaseText, MapChat, MapTranscript } from './Scenario';

/** Respostas dadas na conversa de cada mapa (código do cenário → opções escolhidas em ordem). */
export type MapPaths = Record<string, number[]>;

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  /** Cenários dos conjuntos presentes em `questions`, por código. */
  scenarios: Record<string, Scenario>;
  mode: Mode;
  topic?: string;
  /** Minutos da prova (só no modo prova; nos outros o relógio apenas conta o tempo). */
  minutes: number;
  isSample: boolean;
  onFinish: (answers: Answers, usedSeconds: number, paths: MapPaths) => void;
  /** Recurso salvo: o App envia ao banco quando houver login. */
  onAppeal?: (q: Question, category: AppealCategory, argument: string, chosen: number | undefined) => void;
  onExit: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Quiz({ cfg, questions, scenarios, mode, topic, minutes, isSample, onFinish, onAppeal, onExit }: Props) {
  const timed = mode === 'prova';
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [elapsed, setElapsed] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [paths, setPaths] = useState<MapPaths>({});
  const [mapDone, setMapDone] = useState<Record<string, boolean>>({});
  const answersRef = useRef<Answers>({});
  const pathsRef = useRef<MapPaths>({});
  const elapsedRef = useRef(0);
  const doneRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealCat, setAppealCat] = useState<AppealCategory | ''>('');
  const [appealText, setAppealText] = useState('');
  const [appealMsg, setAppealMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const total = minutes * 60;
  const left = Math.max(0, total - elapsed);
  const q = questions[index];
  const chosen = answers[q.id];
  const answered = chosen !== undefined;
  const isLast = index === questions.length - 1;

  // Conjunto (mapa/caso): correção só no fim da prova; dá para trocar a resposta e voltar dentro do conjunto.
  const scenario = q.scenarioCode ? scenarios[q.scenarioCode] : undefined;
  const range = scenario ? setRange(questions, index) : null;
  const deferred = !!scenario;
  const showMap = scenario?.kind === 'mapa' && !mapDone[scenario.code];
  const setCodes = [...new Set(questions.map((x) => x.scenarioCode).filter((c): c is string => !!c))];
  const setNo = scenario ? setCodes.indexOf(scenario.code) + 1 : 0;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish(answersRef.current, elapsedRef.current, pathsRef.current);
  }, [onFinish]);

  useEffect(() => {
    const id = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (timed && elapsed >= total) finish();
  }, [timed, elapsed, total, finish]);

  const go = (i: number) => {
    setAppealOpen(false);
    setAppealMsg(null);
    setAppealText('');
    setAppealCat('');
    setIndex(i);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const choose = (i: number) => {
    if (answered && !deferred) return;
    answersRef.current = { ...answersRef.current, [q.id]: i };
    setAnswers(answersRef.current);
    window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
  };

  const next = () => (isLast ? finish() : go(index + 1));

  const setPath = (code: string, p: number[]) => {
    pathsRef.current = { ...pathsRef.current, [code]: p };
    setPaths(pathsRef.current);
  };

  const sendAppeal = () => {
    const err = saveAppeal(q.id, appealCat as AppealCategory, appealText);
    if (err) {
      setAppealMsg(err);
      return;
    }
    onAppeal?.(q, appealCat as AppealCategory, appealText, chosen);
    setSent({ ...sent, [q.id]: true });
    setAppealOpen(false);
    setAppealMsg(null);
  };
  const appealed = sent[q.id] || hasAppeal(q.id);

  const urgent = timed && left <= 300;
  const modeLabel = mode === 'prova' ? cfg.label : mode === 'treino' ? `Treino · ${topic ?? ''}` : 'Revisão de erros';
  const answeredCount = Object.keys(answers).length;

  const exitButton = (
    <button
      className={confirmExit ? 'btn btn-primary' : 'btn btn-ghost'}
      onClick={() => {
        if (confirmExit) onExit();
        else {
          setConfirmExit(true);
          window.setTimeout(() => setConfirmExit(false), 4000);
        }
      }}
    >
      {confirmExit ? 'Confirmar saída' : 'Sair'}
    </button>
  );

  const questionCard = (
    <article className="card q-card" key={q.id}>
      <div className="q-meta">
        {scenario && (
          <span className="tag">
            {scenario.kind === 'mapa' ? 'Mapa' : 'Caso'} {setNo} de {setCodes.length} · questão {index - (range?.start ?? 0) + 1} de 2
          </span>
        )}
        <span className={scenario ? 'tag tag-soft' : 'tag'}>{q.topic}</span>
        <span className="tag tag-soft">{q.difficulty}</span>
        {q.source === 'ia' && <span className="tag tag-soft">Gerada por IA</span>}
        {q.source === 'exemplo' && <span className="tag tag-soft">Exemplo</span>}
      </div>
      <h2 className="q-statement">{q.statement}</h2>

      <div className="options" role="radiogroup" aria-label="Alternativas">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex;
          const isChosen = i === chosen;
          let cls = 'option';
          if (deferred) cls += isChosen ? ' is-selected' : '';
          else if (answered && isCorrect) cls += ' is-correct';
          else if (answered && isChosen) cls += ' is-wrong';
          else if (answered) cls += ' is-dim';
          return (
            <button
              key={i}
              role="radio"
              aria-checked={isChosen}
              className={cls}
              disabled={answered && !deferred}
              onClick={() => choose(i)}
            >
              <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
              <span className="opt-text">{opt}</span>
              {deferred && isChosen && <span className="mark" aria-label="Marcada">●</span>}
              {!deferred && answered && isCorrect && <span className="mark" aria-label="Resposta correta">✓</span>}
              {!deferred && answered && isChosen && !isCorrect && <span className="mark" aria-label="Sua resposta, incorreta">✗</span>}
            </button>
          );
        })}
      </div>

      {deferred && (
        <p className="deferred-note small" role="note">
          ⓘ A correção deste conjunto sai no fim da prova. Até sair dele, você pode trocar a resposta.
        </p>
      )}

      {answered && !deferred && (
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
          {chosen !== q.correctIndex && (appealed ? (
            <p className="muted small">✓ Recurso enviado. Será analisado.</p>
          ) : (
            <button className="btn btn-ghost small btn-appeal" onClick={() => setAppealOpen(!appealOpen)} aria-expanded={appealOpen}>
              Contestar esta questão
            </button>
          ))}
          {chosen !== q.correctIndex && appealOpen && !appealed && (
            <div className="appeal-form">
              <label className="small" htmlFor="ap-cat">Motivo</label>
              <select id="ap-cat" value={appealCat} onChange={(e) => setAppealCat(e.target.value as AppealCategory)}>
                <option value="">Selecione…</option>
                {APPEAL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <label className="small" htmlFor="ap-txt">Argumento (cite a norma ou o item do programa)</label>
              <textarea id="ap-txt" rows={4} maxLength={1500} value={appealText} onChange={(e) => setAppealText(e.target.value)} />
              {appealMsg && <p className="small" role="alert">⚠ {appealMsg}</p>}
              <button className="btn btn-primary" onClick={sendAppeal}>Enviar recurso</button>
            </div>
          )}
        </div>
      )}
    </article>
  );

  return (
    <div className="quiz" ref={topRef}>
      <div className="quiz-head">
        <div>
          <strong>
            Questão {index + 1} de {questions.length}
          </strong>
          <span className="muted small">
            {' · '}
            {modeLabel}
          </span>
        </div>
        <div
          className={urgent ? 'timer timer-urgent' : 'timer'}
          role="timer"
          aria-label={timed ? 'Tempo restante' : 'Tempo decorrido'}
        >
          ⏱ {formatClock(timed ? left : elapsed)}
        </div>
      </div>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={answeredCount}
        aria-label="Questões respondidas"
      >
        <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>

      {isSample && (
        <div className="banner banner-info">Questões de exemplo (banco real ainda não carregado).</div>
      )}

      {scenario?.kind === 'mapa' && showMap ? (
        <>
          <MapChat
            key={scenario.code}
            title={scenario.title}
            body={scenario.body}
            path={paths[scenario.code] ?? []}
            onPath={(p) => setPath(scenario.code, p)}
            onDone={() => {
              setMapDone({ ...mapDone, [scenario.code]: true });
              topRef.current?.scrollIntoView({ block: 'start' });
            }}
          />
          <div className="quiz-actions">{exitButton}</div>
        </>
      ) : (
        <>
          {scenario?.kind === 'caso' ? (
            <div className="quiz-split">
              <section className="card case-card" aria-labelledby={`case-${scenario.code}`}>
                <div className="q-meta">
                  <span className="tag">Caso</span>
                  <span className="tag tag-soft">Texto-base das 2 próximas questões</span>
                </div>
                <h2 id={`case-${scenario.code}`}>{scenario.title}</h2>
                <CaseText html={scenario.body.html} />
              </section>
              {questionCard}
            </div>
          ) : (
            <>
              {scenario?.kind === 'mapa' && (
                <details className="card map-review">
                  <summary>Rever a conversa: {scenario.title}</summary>
                  <MapTranscript body={scenario.body} path={paths[scenario.code] ?? []} />
                  <button
                    className="btn btn-ghost small"
                    onClick={() => {
                      setMapDone({ ...mapDone, [scenario.code]: false });
                      if (range) go(range.start);
                    }}
                  >
                    ← Voltar à conversa
                  </button>
                </details>
              )}
              {questionCard}
            </>
          )}

          <div className="quiz-actions">
            {exitButton}
            {range && index > range.start && (
              <button className="btn" onClick={() => go(index - 1)}>
                ← Anterior
              </button>
            )}
            <button ref={nextRef} className="btn btn-primary" disabled={!answered} onClick={next}>
              {isLast ? 'Finalizar' : 'Próxima'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
