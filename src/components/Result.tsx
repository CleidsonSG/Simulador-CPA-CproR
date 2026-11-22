import { useState } from 'react';
import type { Answers, ExamConfig, Feedback, Mode, Question, Scenario } from '../types';
import { formatClock, grade, passMark } from '../lib/exam';
import { pace, toStats } from '../lib/analysis';
import { TopicBars } from './ui';
import { CaseText, MapTranscript } from './Scenario';
import { ResultScore } from './ResultScore';
import { Explanation } from './Explanation';
import type { MapPaths } from './Quiz';

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  scenarios: Record<string, Scenario>;
  paths: MapPaths;
  answers: Answers;
  usedSeconds: number;
  isSample: boolean;
  size: number;
  onRetry: () => void;
  onHome: () => void;
  onPlan: () => void;
  onProgress: () => void;
  mode: Mode;
  /** 'final': a revisão lista todas as questões comentadas (não só os erros). */
  feedback?: Feedback;
  topic?: string;
  onTrain: (topic: string) => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Result({ cfg, questions, scenarios, paths, answers, usedSeconds, isSample, size, onRetry, onHome, onPlan, onProgress, mode, feedback = 'imediata', topic, onTrain }: Props) {
  const full = mode === 'prova' && feedback === 'final';
  const [filter, setFilter] = useState<'todas' | 'erradas' | 'certas' | 'branco'>('todas');
  const g = grade(questions, answers);
  const mark = passMark(cfg, size);
  const wrong = questions.filter((q) => !q.scenarioCode && answers[q.id] !== q.correctIndex);
  const setQs = questions.filter((q) => q.scenarioCode);
  const setCorrect = setQs.filter((q) => answers[q.id] === q.correctIndex).length;
  const sets: { code: string; qs: Question[] }[] = [];
  for (const q of setQs) {
    const last = sets[sets.length - 1];
    if (last?.code === q.scenarioCode) last.qs.push(q);
    else sets.push({ code: q.scenarioCode as string, qs: [q] });
  }
  const stats = toStats(g.byTopic);
  const focus = stats.filter((s) => s.level !== 'ok').slice(0, 3);
  const answered = Object.keys(answers).length;
  const p = pace(usedSeconds, answered, cfg.minutes, cfg.total);
  const blank = questions.length - answered;

  /** Do nº da questão no cartão até a correção comentada dela (mostra todas antes, se houver filtro). */
  const jump = (id: string) => {
    setFilter('todas');
    window.setTimeout(() => {
      const el = document.getElementById(`rev-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('rev-flash');
      window.setTimeout(() => el.classList.remove('rev-flash'), 1800);
    }, 60);
  };

  return (
    <div className="result">
      {mode === 'prova' ? (
        <ResultScore
          cfg={cfg}
          questions={questions}
          answers={answers}
          mark={mark}
          usedSeconds={usedSeconds}
          isSample={isSample}
          onTrain={onTrain}
          onJump={jump}
        />
      ) : (
        <section className="card score" aria-live="polite">
          <p className="muted small">
            {mode === 'treino' ? `Treino · ${topic ?? ''}` : 'Revisão de erros'} · tempo {formatClock(usedSeconds)}
          </p>
          <div className="score-num">
            {g.correct}
            <span>/{g.total}</span>
          </div>
          <p className="verdict">{Math.round(g.pct * 100)}% de acerto</p>
          <p className="muted small">
            {g.correct > 0 && 'As que você acertou saíram do caderno de erros. '}
            {wrong.length > 0 && `${wrong.length} continuam no caderno para revisar.`}
            {wrong.length === 0 && 'Nenhuma pendente neste treino. Muito bem!'}
          </p>
        </section>
      )}

      {mode === 'prova' && (
        <section className="card" aria-labelledby="focus-title">
          <h2 id="focus-title">Onde melhorar agora</h2>
          {focus.length === 0 ? (
            <p>Todos os temas ficaram em 70% ou mais neste simulado. Faça outro para confirmar.</p>
          ) : (
            <ul className="train-list">
              {focus.map((s) => (
                <li key={s.topic}>
                  <div className="train-info">
                    <strong>{s.topic}</strong>
                    <span className="muted small">
                      {s.correct} de {s.total} certas ({Math.round(s.acc * 100)}%)
                    </span>
                  </div>
                  <button className="btn" onClick={() => onTrain(s.topic)}>Treinar</button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Ritmo: {Math.round(p.perQuestion)} s por questão (a prova real dá cerca de {Math.round(p.allowed)} s).
            {p.ratio > 1.1 && ' Você está mais lento que o necessário: treine resolver mais rápido.'}
            {p.ratio > 0 && p.ratio < 0.4 && ' Muito rápido: confira se está lendo todo o enunciado.'}
            {blank > 0 && ` ${blank} questão(ões) ficaram sem resposta.`}
          </p>
          <button className="btn btn-primary btn-block" onClick={onPlan}>Montar plano de estudos com este resultado</button>
        </section>
      )}

      {stats.length > 1 && (
        <section className="card" aria-labelledby="topics-title">
          <h2 id="topics-title">Desempenho por tema</h2>
          <TopicBars stats={stats} />
        </section>
      )}

      {sets.length > 0 && (
        <section className="card" aria-labelledby="sets-title">
          <h2 id="sets-title">
            Correção dos conjuntos ({setCorrect}/{setQs.length})
          </h2>
          <p className="muted small">Mapas de decisão e casos: a correção só aparece agora, no fim da prova.</p>
          <ol className="review sets-review">
            {sets.map(({ code, qs }) => {
              const sc = scenarios[code];
              return (
                <li key={code}>
                  <p className="set-title">
                    <span className="tag">{sc?.kind === 'mapa' ? 'Mapa de decisão' : 'Caso'}</span> <strong>{sc?.title ?? code}</strong>
                  </p>
                  {sc && (
                    <details className="set-base">
                      <summary>{sc.kind === 'mapa' ? 'Rever a conversa' : 'Rever o texto-base'}</summary>
                      {sc.kind === 'mapa' ? <MapTranscript body={sc.body} path={paths[code] ?? []} /> : <CaseText html={sc.body.html} />}
                    </details>
                  )}
                  <ol className="set-qs">
                    {qs.map((q) => {
                      const mine = answers[q.id];
                      const ok = mine === q.correctIndex;
                      return (
                        <li key={q.id} id={`rev-${q.id}`}>
                          <p className="q-statement small-q">
                            <span className={ok ? 'tag tag-ok' : 'tag tag-bad'}>{ok ? '✓ Acertou' : '✗ Errou'}</span>{' '}
                            {q.sourceCode && <span className="tag tag-code num">Nº {q.sourceCode}</span>} {q.statement}
                          </p>
                          {!ok && (
                            <p>
                              <span className="tag tag-bad">
                                Sua resposta: {mine === undefined ? 'em branco' : `${LETTERS[mine]}. ${q.options[mine]}`}
                              </span>
                            </p>
                          )}
                          <p>
                            <span className="tag tag-ok">
                              Correta: {LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}
                            </span>
                          </p>
                          <Explanation q={q} mine={mine} />
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="card" aria-labelledby="rev-title">
        {(() => {
          const mc = questions.filter((q) => !q.scenarioCode);
          const state = (q: Question) => (answers[q.id] === undefined ? 'branco' : answers[q.id] === q.correctIndex ? 'certas' : 'erradas');
          const counts = { todas: mc.length, erradas: 0, certas: 0, branco: 0 } as Record<string, number>;
          for (const q of mc) counts[state(q)]++;
          const list = full ? mc.filter((q) => filter === 'todas' || state(q) === filter) : wrong;
          const LABELS = { todas: 'Todas', erradas: 'Erradas', certas: 'Certas', branco: 'Em branco' } as const;
          return (
            <>
              <h2 id="rev-title">
                {full ? 'Correção comentada' : `Revisão dos erros${setQs.length > 0 ? ' de múltipla escolha' : ''}`} ({full ? mc.length : wrong.length})
              </h2>
              {full && (
                <div className="chips-toggle review-filter" role="group" aria-label="Filtrar questões">
                  {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
                    <button key={k} className={filter === k ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={filter === k} onClick={() => setFilter(k)} disabled={counts[k] === 0 && k !== 'todas'}>
                      {LABELS[k]} <span className="chip-n">{counts[k]}</span>
                    </button>
                  ))}
                </div>
              )}
              {list.length === 0 ? (
                <div className="empty-inline">
                  <p>{full ? 'Nenhuma questão neste filtro.' : 'Você não errou nenhuma questão. Excelente!'}</p>
                </div>
              ) : (
                <ol className="review">
                  {list.map((q) => {
                    const mine = answers[q.id];
                    const ok = mine === q.correctIndex;
                    return (
                      <li key={q.id} id={`rev-${q.id}`}>
                        <p className="q-statement small-q">
                          {full && <span className={ok ? 'tag tag-ok' : 'tag tag-bad'}>{ok ? '✓ Acertou' : mine === undefined ? '○ Em branco' : '✗ Errou'}</span>}{' '}
                          {q.sourceCode && <span className="tag tag-code num">Nº {q.sourceCode}</span>} {q.statement}
                        </p>
                        {!ok && (
                          <p>
                            <span className="tag tag-bad">Sua resposta: {mine === undefined ? 'em branco' : `${LETTERS[mine]}. ${q.options[mine]}`}</span>
                          </p>
                        )}
                        <p>
                          <span className="tag tag-ok">
                            {ok ? 'Sua resposta (correta)' : 'Correta'}: {LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}
                          </span>
                        </p>
                        <Explanation q={q} mine={mine} />
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          );
        })()}
      </section>

      <div className="quiz-actions wrap">
        <button className="btn" onClick={onHome}>Início</button>
        <button className="btn" onClick={onProgress}>Meu desempenho</button>
        <button className="btn btn-primary" onClick={onRetry}>{mode === 'prova' ? 'Novo simulado' : 'Treinar de novo'}</button>
      </div>
    </div>
  );
}
