import { useState } from 'react';
import type { AttemptRecord, Cert } from '../types';
import { EXAMS, formatClock } from '../lib/exam';
import { ConfirmDialog, Icon } from './ui';

interface Props {
  history: AttemptRecord[];
  onStart: (cert: Cert) => void;
  onProgress: () => void;
  onPlan: () => void;
  onTrain: () => void;
  /** Limpa histórico, treino focado, desempenho e plano. Devolve um aviso (ou null se tudo certo). */
  onClearHistory: () => Promise<string | null>;
  errorCount: number;
  signedIn: boolean;
}

const DETAILS: Record<Cert, string[]> = {
  CPA: ['50 questões', '2h30 de prova', 'Aprovação: 35 acertos (70%)'],
  CPRO_R: ['45 questões', '2h30 de prova', 'Aprovação: 32 acertos (71%)'],
  CPRO_I: ['40 questões', '2h30 de prova', 'Aprovação: 28 acertos (70%)'],
};

export function Home({ history, onStart, onProgress, onPlan, onTrain, onClearHistory, errorCount, signedIn }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const hasData = history.length > 0 || errorCount > 0;

  const clear = async () => {
    setBusy(true);
    const warn = await onClearHistory();
    setBusy(false);
    setAsking(false);
    setMsg(warn ? { kind: 'warn', text: warn } : { kind: 'ok', text: 'Histórico limpo. Seu próximo simulado começa do zero.' });
  };

  return (
    <>
      <section className="hero">
        <h1>Simulado Anbima</h1>
        <p>Treine no formato da prova real. A cada resposta você vê na hora se acertou e, se errou, entende o porquê.</p>
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
          <span className="tool-icon"><Icon name="target" /></span>
          <span className="tool-text">
            <strong>Treino focado{errorCount > 0 && <span className="badge">{errorCount}</span>}</strong>
            <span className="muted small">Refaça seus erros ou treine só um tema</span>
          </span>
        </button>
        <button className="card tool" onClick={onProgress}>
          <span className="tool-icon"><Icon name="chart" /></span>
          <span className="tool-text">
            <strong>Meu desempenho</strong>
            <span className="muted small">Evolução, temas a reforçar e prontidão</span>
          </span>
        </button>
        <button className="card tool" onClick={onPlan}>
          <span className="tool-icon"><Icon name="calendar" /></span>
          <span className="tool-text">
            <strong>Plano de estudos</strong>
            <span className="muted small">Ciclo semanal por tema, para imprimir</span>
          </span>
        </button>
      </section>

      <section className="card" aria-labelledby="hist-title">
        <div className="card-head">
          <h2 id="hist-title">Seu histórico</h2>
          {hasData && (
            <button className="btn btn-ghost small-btn btn-quiet-danger" onClick={() => { setMsg(null); setAsking(true); }}>
              <Icon name="trash" size={18} /> Limpar histórico
            </button>
          )}
        </div>
        {msg && (
          <p className={msg.kind === 'ok' ? 'feedback feedback-ok small' : 'banner banner-warn plan-warn small'} role="status">
            {msg.kind === 'ok' ? '✓ ' : '⚠ '}
            {msg.text}
          </p>
        )}
        {history.length === 0 ? (
          <div className="empty-inline">
            <p>Nenhum simulado feito ainda. Escolha uma certificação acima para começar.</p>
          </div>
        ) : (
          <ul className="history">
            {history.slice(0, 8).map((h) => {
              const p = Math.round((h.correct / h.total) * 100);
              const cut = Math.round((h.passMark / h.total) * 100);
              return (
                <li key={h.id}>
                  <div className="hist-left">
                    <strong>{EXAMS[h.cert].label}</strong>
                    <span className="muted small">{new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <div className={`hist-bar ${h.passed ? 'bar-ok' : 'bar-critico'}`} aria-hidden="true">
                    <span style={{ width: `${p}%` }} />
                    <i className="bar-cut" style={{ left: `${cut}%` }} />
                  </div>
                  <div className="hist-right">
                    <span className="num">{h.correct}/{h.total}</span>
                    <span className={h.passed ? 'tag tag-ok' : 'tag tag-bad'}>{h.passed ? '✓ Aprovado' : '✗ Reprovado'}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {asking && (
        <ConfirmDialog title="Limpar histórico?" confirmLabel="Limpar histórico" busy={busy} onConfirm={clear} onCancel={() => setAsking(false)}>
          <p>Isto apaga, de vez:</p>
          <ul className="plain">
            <li>os simulados de <b>Seu histórico</b>;</li>
            <li>a evolução e os temas de <b>Meu desempenho</b>;</li>
            <li>os erros guardados no <b>Treino focado</b>;</li>
            <li>a rotina e o ciclo marcado no <b>Plano de estudos</b>.</li>
          </ul>
          <p className="muted small">
            {signedIn ? 'Vale para esta conta em todos os aparelhos. ' : ''}Recursos já enviados continuam em análise. Não dá para desfazer.
          </p>
        </ConfirmDialog>
      )}

      <p className="muted small foot">
        Relógio da prova real: {formatClock(EXAMS.CPA.minutes * 60)}. Material de estudo independente, sem vínculo com a Anbima.
      </p>
    </>
  );
}
