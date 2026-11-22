import { useEffect, useState } from 'react';
import type { Answers, ExamConfig, Question } from '../types';
import { macroBreakdown } from '../lib/analysis';

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  answers: Answers;
  /** Acertos mínimos para passar (nota de corte desta prova). */
  mark: number;
  usedSeconds: number;
  isSample: boolean;
  onTrain: (topic: string) => void;
  /** Leva até a correção comentada da questão. */
  onJump: (questionId: string) => void;
}

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min${String(Math.floor(s % 60)).padStart(2, '0')}s`;
};

/**
 * Resultado do simulado: placar, régua até a nota de corte (com o trecho que faltou) e uma régua por
 * macrotema. Tocar num macrotema abre os temas dele, com treino e o nº das questões erradas.
 */
export function ResultScore({ cfg, questions, answers, mark, usedSeconds, isSample, onTrain, onJump }: Props) {
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length;
  const blank = questions.filter((q) => answers[q.id] === undefined).length;
  const wrong = total - correct - blank;
  const passed = correct >= mark;
  const pct = total ? correct / total : 0;
  const cutPct = cfg.passPct * 100;
  const macros = macroBreakdown(cfg.cert, questions, answers);
  const worst = [...macros].filter((m) => m.n > 0).sort((a, b) => b.n - b.c - (a.n - a.c) || a.c / a.n - b.c / b.n)[0]; // mais questões perdidas; empate: menor %
  const [open, setOpen] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 60);
    return () => window.clearTimeout(id);
  }, []);
  const w = (v: number) => (grown ? `${v}%` : '0%');

  return (
    <section className={`card rs ${passed ? 'rs-ok' : 'rs-bad'}`} aria-labelledby="rs-title">
      <div className="rs-head">
        <div>
          <span className="rs-eyebrow" id="rs-title">Simulado {cfg.label} · {total} questões</span>
          <div className="rs-score num">
            <b>{correct}</b>
            <span>/{total}</span>
            <em>{Math.round(pct * 100)}% de acertos</em>
          </div>
        </div>
        <span className={passed ? 'rs-verdict rs-v-ok' : 'rs-verdict rs-v-bad'} aria-live="polite">{passed ? '✓ Aprovado' : '✗ Reprovado'}</span>
      </div>

      <div className="rs-ruler" role="img" aria-label={`${correct} acertos de ${total}; nota de corte ${mark}${passed ? '' : `; faltaram ${mark - correct}`}`}>
        <div className="rs-track">
          <div className="rs-fill" style={{ width: w(pct * 100) }} />
          {!passed && <div className="rs-gap" style={{ left: `${pct * 100}%`, width: `${((mark - correct) / total) * 100}%`, opacity: grown ? 1 : 0 }} />}
          <span className="rs-cut" style={{ left: `${(mark / total) * 100}%` }} />
        </div>
        <span className="rs-cut-label num" style={{ left: `${(mark / total) * 100}%` }}>nota de corte · {mark}</span>
        <div className="rs-scale num"><span>0</span><span>{total}</span></div>
      </div>

      {macros.length > 0 && (
        <>
          <h3 className="rs-h3">Por macrotema <span className="muted small">(toque para ver os temas)</span></h3>
          <ul className="rs-macros">
            {macros.map((m, i) => {
              const p = m.n ? m.c / m.n : 0;
              const good = p * 100 >= cutPct;
              const isOpen = open === i;
              return (
                <li key={m.id}>
                  <button type="button" className="rs-mrow" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                    <span className="rs-mtop">
                      <span><span className="rs-chev" aria-hidden="true">›</span>{m.name}</span>
                      <span className={`num ${good ? 'rs-good' : 'rs-low'}`}>{m.c}/{m.n} · {Math.round(p * 100)}%</span>
                    </span>
                    <span className="rs-mtrack">
                      <span className={good ? 'rs-mfill rs-good-bg' : 'rs-mfill rs-low-bg'} style={{ width: w(p * 100) }} />
                      <span className="rs-cut" style={{ left: `${cutPct}%` }} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="rs-topics">
                      {m.topics.map((t) => {
                        const tp = t.n ? t.c / t.n : 0;
                        return (
                          <div className="rs-topic" key={t.topic}>
                            <div className="rs-tleft">
                              <span>{t.topic} <span className="muted small num">{t.c}/{t.n}</span></span>
                              <div className="rs-qs">
                                {t.wrong.length ? (
                                  <>
                                    <span className="rs-qlbl">Erradas:</span>
                                    {t.wrong.map((q) => (
                                      <button
                                        type="button"
                                        key={q.id}
                                        className="rs-chip num"
                                        title="Ver a correção comentada"
                                        onClick={() => onJump(q.id)}
                                      >
                                        {q.sourceCode ? `Nº ${q.sourceCode}` : `Questão ${questions.indexOf(q) + 1}`}
                                      </button>
                                    ))}
                                  </>
                                ) : (
                                  <span className="rs-qlbl rs-good">✓ Sem erros</span>
                                )}
                              </div>
                            </div>
                            <div className="rs-tright">
                              <span className="rs-tbar" aria-hidden="true">
                                <i className={tp * 100 >= cutPct ? 'rs-good-bg' : 'rs-low-bg'} style={{ width: `${Math.max(tp * 100, 3)}%` }} />
                              </span>
                              <button type="button" className="btn btn-ghost rs-train" onClick={() => onTrain(t.topic)} aria-label={`Treinar ${t.topic}`}>
                                Treinar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {worst && worst.c < worst.n && (
            <p className="rs-msg">
              Onde você mais perdeu pontos: <b>{worst.name}</b> ({Math.round((worst.c / worst.n) * 100)}% de acertos,{' '}
              {worst.n - worst.c} {worst.n - worst.c === 1 ? 'questão' : 'questões'} a recuperar).
            </p>
          )}
        </>
      )}

      <div className="rs-stats">
        <div><span><i className="rs-good-bg" />Acertos</span><b className="num">{correct}</b></div>
        <div><span><i className="rs-low-bg" />Erros</span><b className="num">{wrong}</b></div>
        <div><span><i className="rs-blank" />Em branco</span><b className="num">{blank}</b></div>
        <div><span>Tempo usado</span><b className="num">{fmtTime(usedSeconds)}</b></div>
      </div>
      {isSample && <p className="small muted rs-sample">Resultado com questões de exemplo.</p>}
    </section>
  );
}

