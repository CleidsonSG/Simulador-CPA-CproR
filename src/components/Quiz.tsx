import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answers, ExamConfig, Mode, Question, Scenario, Feedback } from '../types';
import { formatClock, setRange } from '../lib/exam';
import { APPEAL_CATEGORIES, hasAppeal, saveAppeal } from '../lib/appeals';
import type { AppealCategory } from '../lib/appeals';
import { ConfirmDialog } from './ui';
import { shownJustifications, tidyExplanation } from '../lib/justify';
import { CaseText, MapChat, MapTranscript } from './Scenario';

/** Respostas dadas na conversa de cada mapa (código do cenário → opções escolhidas em ordem). */
export type MapPaths = Record<string, number[]>;

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  /** Cenários dos conjuntos presentes em `questions`, por código. */
  scenarios: Record<string, Scenario>;
  mode: Mode;
  /** Simulado: 'final' = sem correção durante a prova, com navegação livre entre as questões. */
  feedback?: Feedback;
  topic?: string;
  /** Minutos da prova (só no modo prova; nos outros o relógio apenas conta o tempo). */
  minutes: number;
  isSample: boolean;
  /** Degustação: etiqueta própria e sem cronômetro (minutes = 0). */
  trial?: boolean;
  onFinish: (answers: Answers, usedSeconds: number, paths: MapPaths) => void;
  /** Recurso salvo: o App envia ao banco quando houver login. */
  onAppeal?: (q: Question, category: AppealCategory, argument: string, chosen: number | undefined) => void;
  onExit: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Quiz({ cfg, questions, scenarios, mode, feedback = 'imediata', topic, minutes, isSample, trial = false, onFinish, onAppeal, onExit }: Props) {
  const exam = mode === 'prova';
  /** Prova com tempo limite (a degustação não tem: o relógio só conta). */
  const timed = exam && minutes > 0;
  /** Correção só no fim: dá para avançar, voltar e trocar respostas até finalizar. */
  const atEnd = exam && feedback === 'final';
  const [askFinish, setAskFinish] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [elapsed, setElapsed] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  // Pausa: o relógio para e a questão some da tela (a pausa não vira tempo extra para pensar).
  const [paused, setPaused] = useState(false);
  const [pausedFor, setPausedFor] = useState(0);
  const pausedRef = useRef(false);
  const resumeRef = useRef<HTMLButtonElement>(null);
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
  /** Justificativa de cada alternativa, já na ordem da tela (null se a explicação não vier por letra). */
  const whys = q ? shownJustifications(q) : null;
  const isLast = index === questions.length - 1;

  // Conjunto (mapa/caso): correção só no fim da prova; dá para trocar a resposta e voltar dentro do conjunto.
  const scenario = q.scenarioCode ? scenarios[q.scenarioCode] : undefined;
  const range = scenario ? setRange(questions, index) : null;
  const deferred = !!scenario || atEnd;
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
      if (pausedRef.current) {
        setPausedFor((p) => p + 1);
        return;
      }
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (timed && elapsed >= total) finish();
  }, [timed, elapsed, total, finish]);

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    setPausedFor(0);
    setConfirmExit(false);
  };
  useEffect(() => {
    if (paused) resumeRef.current?.focus();
  }, [paused]);

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

  const next = () => {
    if (!isLast) return go(index + 1);
    if (atEnd && Object.keys(answersRef.current).length < questions.length) return setAskFinish(true);
    finish();
  };

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
        {trial && <span className="tag tag-try">Degustação · questão {index + 1} de {questions.length}</span>}
        {q.sourceCode && <span className="tag tag-code num" title="Nº da questão na Anbima">Nº {q.sourceCode}</span>}
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
          const why = answered && !deferred ? whys?.byShown[i] : undefined;
          const isCorrect = i === q.correctIndex;
          const isChosen = i === chosen;
          let cls = 'option';
          if (deferred) cls += isChosen ? ' is-selected' : '';
          else if (answered && isCorrect) cls += ' is-correct';
          else if (answered && isChosen) cls += ' is-wrong';
          else if (answered) cls += ' is-dim';
          if (why) cls += ' has-why';
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
              {why ? (
                <span className="opt-body">
                  <span className="opt-text">{opt}</span>
                  <span className="opt-why"><b>{isCorrect ? 'Gabarito e justificativa:' : 'Justificativa:'}</b> {why}</span>
                </span>
              ) : (
                <span className="opt-text">{opt}</span>
              )}
              {deferred && isChosen && <span className="mark" aria-label="Marcada">●</span>}
              {!deferred && answered && isCorrect && <span className="mark" aria-label="Resposta correta">✓</span>}
              {!deferred && answered && isChosen && !isCorrect && <span className="mark" aria-label="Sua resposta, incorreta">✗</span>}
            </button>
          );
        })}
      </div>

      {deferred && (
        <p className="deferred-note small" role="note">
          {atEnd
            ? 'ⓘ Correção no final: você pode voltar e trocar a resposta até finalizar a prova.'
            : 'ⓘ A correção deste conjunto sai no fim da prova. Até sair dele, você pode trocar a resposta.'}
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
              {whys ? (
                <>
                  {whys.intro && <p className="explain">{whys.intro}</p>}
                  <p className="small">A justificativa de cada alternativa está nela, acima.</p>
                </>
              ) : (
                <p className="explain">{tidyExplanation(q.explanation)}</p>
              )}
            </>
          )}
          {chosen !== q.correctIndex && q.source !== 'ia' && (appealed ? (
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

  const blank = questions.length - answeredCount;

  return (
    <div className="quiz" ref={topRef}>
      {askFinish && (
        <ConfirmDialog
          title="Finalizar a prova?"
          confirmLabel="Finalizar prova"
          danger={false}
          onCancel={() => setAskFinish(false)}
          onConfirm={() => {
            setAskFinish(false);
            finish();
          }}
        >
          <p>
            Você deixou <b>{blank} {blank === 1 ? 'questão' : 'questões'} em branco</b>. Questão em branco conta como erro.
          </p>
          <p className="muted small">Use "Anterior" para voltar a elas antes de finalizar.</p>
        </ConfirmDialog>
      )}
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
        <div className="timer-wrap">
          <div
            className={paused ? 'timer timer-paused' : urgent ? 'timer timer-urgent' : 'timer'}
            role="timer"
            aria-label={`${timed ? 'Tempo restante' : 'Tempo decorrido'}${paused ? ' (pausado)' : ''}`}
          >
            {paused ? <svg className="timer-ico" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor" /></svg> : '⏱'} {formatClock(timed ? left : elapsed)}
          </div>
          <button
            type="button"
            className={paused ? 'pause-btn is-paused' : 'pause-btn'}
            onClick={togglePause}
            aria-pressed={paused}
            aria-label={paused ? 'Continuar a prova' : 'Pausar o tempo'}
            title={paused ? 'Continuar' : 'Pausar'}
          >
            {paused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
            )}
            <span className="pause-label">{paused ? 'Continuar' : 'Pausar'}</span>
          </button>
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

      {isSample && !trial && (
        <div className="banner banner-info">Questões de exemplo (banco real ainda não carregado).</div>
      )}

      {paused ? (
        <section className="card pause-card" role="status" aria-live="polite">
          <span className="pause-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
          </span>
          <h2>{exam ? 'Prova pausada' : 'Treino pausado'}</h2>
          <p className="pause-time num">
            {timed ? <>Restam <strong>{formatClock(left)}</strong></> : <>Tempo de estudo: <strong>{formatClock(elapsed)}</strong></>}
          </p>
          <p className="muted small">
            {answeredCount} de {questions.length} questões respondidas · pausado há <span className="num">{formatClock(pausedFor).replace(/^00:/, '')}</span>
          </p>
          <p className="muted small">A questão fica escondida durante a pausa. Na prova oficial não há pausa: use com moderação.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {exitButton}
            <button ref={resumeRef} type="button" className="btn btn-primary" onClick={togglePause}>
              ▶ Continuar
            </button>
          </div>
        </section>
      ) : scenario?.kind === 'mapa' && showMap ? (
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
          <div className="quiz-actions">
            {exitButton}
            {atEnd && index > 0 && (
              <button className="btn" onClick={() => go(index - 1)}>
                ← Anterior
              </button>
            )}
          </div>
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
            {(atEnd ? index > 0 : range && index > range.start) && (
              <button className="btn" onClick={() => go(index - 1)}>
                ← Anterior
              </button>
            )}
            <button ref={nextRef} className="btn btn-primary" disabled={!answered && !atEnd} onClick={next}>
              {isLast ? 'Finalizar' : 'Próxima'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
