import { useEffect, useMemo, useState } from 'react';
import type { AttemptRecord, Cert, Mode } from '../types';
import { EXAMS, TRIAL } from '../lib/exam';
import { aggregateTopics, toStats } from '../lib/analysis';
import { errorIds, type ErrorBook } from '../lib/errors';
import { loadQuestions, loadTrainingQuestions } from '../data/source';
import { CertTabs, LevelTag, Locked } from './ui';

export interface StartOpts {
  cert: Cert;
  mode: Mode;
  topic?: string;
  count?: number;
  /** Só no simulado (mode 'prova'). Ausente = imediata. */
  feedback?: import('../types').Feedback;
  /** Sessão da degustação (conta sem liberação). */
  trial?: boolean;
}

interface Props {
  cert: Cert;
  history: AttemptRecord[];
  errors: ErrorBook;
  onCert: (c: Cert) => void;
  onStart: (o: StartOpts) => void;
  onBack: () => void;
  /** Degustação: só CPA, até 3 questões por tema, sem caderno de erros. */
  trial?: boolean;
  /** Conta aprovada: conta as questões do banco real e as de treino. */
  signedIn?: boolean;
}

const LABELS = Object.fromEntries((Object.keys(EXAMS) as Cert[]).map((c) => [c, EXAMS[c].label])) as Record<Cert, string>;

export function Train({ cert, history, errors, onCert, onStart, onBack, trial = false, signedIn = false }: Props) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [nTraining, setNTraining] = useState(0);
  const [size, setSize] = useState(trial ? TRIAL.trainMax : 10);
  const sizes = trial ? [TRIAL.trainMax] : [5, 10, 20];

  useEffect(() => {
    let alive = true;
    setCounts(null);
    const full = signedIn && !trial;
    Promise.all([loadQuestions(cert, full), full ? loadTrainingQuestions(cert, true) : Promise.resolve([])])
      .then(([b, extra]) => {
        if (!alive) return;
        const m: Record<string, number> = {};
        // Só múltipla escolha conta: questões de conjunto ficam fora do treino.
        [...b.questions.filter((q) => !q.scenarioCode), ...extra].forEach((q) => (m[q.topic] = (m[q.topic] ?? 0) + 1));
        setCounts(m);
        setNTraining(extra.length);
      })
      .catch(() => alive && setCounts({}));
    return () => {
      alive = false;
    };
  }, [cert, signedIn, trial]);

  const nErrors = errorIds(errors, cert).length;
  const stats = useMemo(
    () => toStats(aggregateTopics(history, cert), Object.keys(counts ?? {})),
    [history, cert, counts],
  );
  const weakest = stats.find((s) => s.known && s.level !== 'ok')?.topic;

  return (
    <div className="stack">
      <div className="row row-between">
        <h1>Treino focado</h1>
        <button className="btn btn-ghost" onClick={onBack}>← Início</button>
      </div>

      <CertTabs certs={Object.keys(EXAMS) as Cert[]} labels={LABELS} cert={cert} onCert={onCert} trial={trial} />

      {trial ? (
        <Locked title="Caderno de erros">
        <section className="card" aria-labelledby="book-title">
          <h2 id="book-title">Caderno de erros</h2>
          {nErrors === 0 ? (
            <div className="empty-inline">
              Nenhum erro guardado em {EXAMS[cert].label}. As questões que você errar aparecem aqui para refazer.
            </div>
          ) : (
            <>
              <p>
                Você tem <strong>{nErrors}</strong> {nErrors === 1 ? 'questão' : 'questões'} para revisar. Acertou no treino, ela sai do caderno.
              </p>
              <button className="btn btn-primary btn-block" onClick={() => onStart({ cert, mode: 'erros' })}>
                Refazer meus erros ({nErrors})
              </button>
            </>
          )}
        </section>
          </Locked>
      ) : (
      <section className="card" aria-labelledby="book-title">
        <h2 id="book-title">Caderno de erros</h2>
        {nErrors === 0 ? (
          <div className="empty-inline">
            Nenhum erro guardado em {EXAMS[cert].label}. As questões que você errar aparecem aqui para refazer.
          </div>
        ) : (
          <>
            <p>
              Você tem <strong>{nErrors}</strong> {nErrors === 1 ? 'questão' : 'questões'} para revisar. Acertou no treino, ela sai do caderno.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => onStart({ cert, mode: 'erros' })}>
              Refazer meus erros ({nErrors})
            </button>
          </>
        )}
      </section>
      )}

      <section className="card" aria-labelledby="tema-title">
        <h2 id="tema-title">Treino por tema</h2>
        <div className="seg" role="group" aria-label="Quantidade de questões">
          {sizes.map((n) => (
            <button key={n} className={n === size ? 'seg-btn seg-on' : 'seg-btn'} aria-pressed={n === size} onClick={() => setSize(n)}>
              {n} questões
            </button>
          ))}
        </div>

        {counts === null ? (
          <div className="skeleton-card" aria-busy="true" aria-label="Carregando temas">
            <div className="sk sk-opt" />
            <div className="sk sk-opt" />
            <div className="sk sk-opt" />
          </div>
        ) : stats.length === 0 ? (
          <div className="empty-inline">Não há questões cadastradas para {EXAMS[cert].label}.</div>
        ) : (
          <ul className="train-list">
            {stats.map((s) => (
              <li key={s.topic}>
                <div className="train-info">
                  <strong>{s.topic}</strong>
                  <span className="muted small">
                    {counts[s.topic] ?? 0} {(counts[s.topic] ?? 0) === 1 ? 'questão' : 'questões'} no banco
                    {s.known && ` · ${Math.round(s.acc * 100)}% de acerto`}
                  </span>
                  <span className="train-tags">
                    <LevelTag level={s.level} known={s.known} />
                    {s.topic === weakest && <span className="tag tag-reco">★ Recomendado</span>}
                  </span>
                </div>
                <button
                  className="btn"
                  disabled={(counts[s.topic] ?? 0) === 0}
                  onClick={() => onStart({ cert, mode: 'treino', topic: s.topic, count: size })}
                >
                  Treinar
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          {trial ? 'Degustação: até 3 questões por treino, com questões de exemplo. ' : ''}O treino mostra o resultado na hora, sem nota de corte e sem cronômetro.
          {nTraining > 0 && ` Inclui ${nTraining} ${nTraining === 1 ? 'questão de treino criada por IA e revisada, marcada' : 'questões de treino criadas por IA e revisadas, marcadas'} como "Gerada por IA" (nunca entram no simulado).`}
        </p>
      </section>
    </div>
  );
}
