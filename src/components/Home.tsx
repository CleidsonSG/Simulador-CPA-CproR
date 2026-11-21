import type { AttemptRecord, Cert } from '../types';
import { EXAMS, formatClock } from '../lib/exam';

interface Props {
  history: AttemptRecord[];
  onStart: (cert: Cert) => void;
  onProgress: () => void;
  onPlan: () => void;
  onTrain: () => void;
  errorCount: number;
}

const DETAILS: Record<Cert, string[]> = {
  CPA: ['50 questões', '2h30 de prova', 'Aprovação: 35 acertos (70%)'],
  CPRO_R: ['45 questões', '2h30 de prova', 'Aprovação: 32 acertos (71%)'],
};

export function Home({ history, onStart, onProgress, onPlan, onTrain, errorCount }: Props) {
  return (
    <>
      <section className="hero">
        <h1>Simulado Anbima</h1>
        <p>Treine com o formato da prova real. A cada resposta você vê na hora se acertou e, se errou, entende o porquê.</p>
      </section>

      <section className="grid" aria-label="Escolha a certificação">
        {(Object.keys(EXAMS) as Cert[]).map((cert) => (
          <article className="card cert-card" key={cert}>
            <h2>{EXAMS[cert].label}</h2>
            <p className="muted">{EXAMS[cert].fullName}</p>
            <ul className="chips">
              {DETAILS[cert].map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <button className="btn btn-primary btn-block" onClick={() => onStart(cert)}>
              Iniciar simulado {EXAMS[cert].label}
            </button>
          </article>
        ))}
      </section>

      <section className="tools" aria-label="Acompanhamento">
        <button className="card tool" onClick={onTrain}>
          <strong>🎯 Treino focado{errorCount > 0 ? ` · ${errorCount} p/ revisar` : ''}</strong>
          <span className="muted small">Refaça seus erros ou treine só um tema</span>
        </button>
        <button className="card tool" onClick={onProgress}>
          <strong>📈 Meu desempenho</strong>
          <span className="muted small">Evolução, temas fracos e indicador de prontidão</span>
        </button>
        <button className="card tool" onClick={onPlan}>
          <strong>🗓 Plano de estudos</strong>
          <span className="muted small">Ciclo semanal por tema, para imprimir ou salvar em PDF</span>
        </button>
      </section>

      <section className="card" aria-labelledby="hist-title">
        <h2 id="hist-title">Seu histórico</h2>
        {history.length === 0 ? (
          <div className="empty-inline">
            <p>Nenhum simulado feito ainda. Escolha uma certificação acima para começar.</p>
          </div>
        ) : (
          <ul className="history">
            {history.slice(0, 8).map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{EXAMS[h.cert].label}</strong>
                  <span className="muted small">
                    {new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <div className="hist-right">
                  <span>
                    {h.correct}/{h.total}
                  </span>
                  <span className={h.passed ? 'tag tag-ok' : 'tag tag-bad'}>
                    {h.passed ? '✓ Aprovado' : '✗ Reprovado'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted small foot">
        Relógio da prova real: {formatClock(EXAMS.CPA.minutes * 60)}. Material de estudo independente, sem vínculo com a Anbima.
      </p>
    </>
  );
}
