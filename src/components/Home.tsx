import { useState } from 'react';
import type { AttemptRecord, Cert, Feedback } from '../types';
import { EXAMS, TRIAL, formatClock } from '../lib/exam';
import { ConfirmDialog, Icon } from './ui';
import { StartDialog } from './StartDialog';

interface Props {
  history: AttemptRecord[];
  onStart: (cert: Cert, feedback: Feedback) => void;
  onProgress: () => void;
  onPlan: () => void;
  onTrain: () => void;
  /** Limpa histórico, treino focado, desempenho e plano. Devolve um aviso (ou null se tudo certo). */
  onClearHistory: () => Promise<string | null>;
  errorCount: number;
  signedIn: boolean;
  /** Degustação: conta sem liberação (ou sem login, que precisa entrar antes). */
  trial?: 'conta' | 'entrar' | null;
  onLogin?: () => void;
}

const DETAILS: Record<Cert, string[]> = {
  CPA: ['50 questões', '2h30 de prova', 'Aprovação: 35 acertos (70%)'],
  CPRO_R: ['45 questões', '2h30 de prova', 'Aprovação: 32 acertos (71%)'],
  CPRO_I: ['40 questões', '2h30 de prova', 'Aprovação: 28 acertos (70%)'],
};

export function Home({ history, onStart, onProgress, onPlan, onTrain, onClearHistory, errorCount, signedIn, trial = null, onLogin }: Props) {
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState<Cert | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const hasData = history.length > 0 || errorCount > 0;
  const [howOpen, setHowOpen] = useState(false);
  const login = trial === 'entrar';
  /** Sem login, os atalhos levam a entrar na conta. */
  const go = (fn: () => void) => () => (login && onLogin ? onLogin() : fn());

  const clear = async () => {
    setBusy(true);
    const warn = await onClearHistory();
    setBusy(false);
    setAsking(false);
    setMsg(warn ? { kind: 'warn', text: warn } : { kind: 'ok', text: 'Histórico limpo. Seu próximo simulado começa do zero.' });
  };

  return (
    <>
      {trial && (
        <section className="trial-banner" role="status">
          <span className="trial-ico"><Icon name="star" /></span>
          <div>
            <strong>{login ? 'Experimente grátis' : 'Você está na versão de degustação'}</strong>
            <p>
              {login
                ? 'Entre ou crie sua conta para fazer a degustação: simulado da CPA com 5 questões e 1 mapa de decisão.'
                : 'Simulado da CPA com 5 questões e 1 mapa de decisão. São questões de exemplo, próprias do projeto (não são da Anbima).'}
            </p>
            {!login && howOpen && (
              <p className="trial-how">
                Sua conta já está com o administrador. Assim que ela for liberada, as três certificações, o banco completo e todos os
                recursos ficam disponíveis — basta entrar de novo.
              </p>
            )}
          </div>
          {login ? (
            <button className="btn" onClick={onLogin}>Entrar ou criar conta</button>
          ) : (
            <button className="btn" aria-expanded={howOpen} onClick={() => setHowOpen(!howOpen)}>
              Como liberar o acesso completo
            </button>
          )}
        </section>
      )}

      <section className="hero">
        <h1>Simulado Anbima</h1>
        <p>Treine no formato da prova real. A cada resposta você vê na hora se acertou e, se errou, entende o porquê.</p>
      </section>

      <section className="grid" aria-label="Escolha a certificação">
        {(Object.keys(EXAMS) as Cert[]).map((cert) => {
          if (!trial) {
            return (
              <article className="card cert-card" key={cert}>
                <h2>{EXAMS[cert].label}</h2>
                <p className="muted">{EXAMS[cert].fullName}</p>
                <ul className="chips">
                  {DETAILS[cert].map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-block" onClick={() => setStarting(cert)}>
                  Iniciar simulado {EXAMS[cert].label}
                </button>
              </article>
            );
          }
          return (
            <article className={cert === TRIAL.cert ? 'card cert-card is-trial' : 'card cert-card is-locked'} key={cert} aria-disabled={cert !== TRIAL.cert || undefined}>
              <div className="cert-top">
                <h2>{EXAMS[cert].label}</h2>
                {cert === TRIAL.cert ? (
                  <span className="seal"><Icon name="star" size={13} />Degustação</span>
                ) : (
                  <span className="lock-badge"><Icon name="lock" size={13} />Acesso completo</span>
                )}
              </div>
              <p className="muted">{EXAMS[cert].fullName}</p>
              <ul className="chips">
                {(cert === TRIAL.cert ? ['5 questões + 1 mapa', 'Sem limite de tempo', 'Questões de exemplo'] : DETAILS[cert].slice(0, 2)).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              {cert !== TRIAL.cert ? (
                <button className="btn btn-block btn-locked" disabled>
                  <Icon name="lock" size={16} />Disponível após a liberação
                </button>
              ) : login ? (
                <button className="btn btn-primary btn-block" onClick={onLogin}>Entrar para começar</button>
              ) : (
                <button className="btn btn-primary btn-block" onClick={() => setStarting(cert)}>Iniciar degustação CPA</button>
              )}
            </article>
          );
        })}
      </section>

      <section className="tools" aria-label="Acompanhamento">
        <button className="card tool" onClick={go(onTrain)}>
          <span className="tool-icon"><Icon name="target" /></span>
          <span className="tool-text">
            <strong>Treino focado{errorCount > 0 && <span className="badge">{errorCount}</span>}</strong>
            <span className="muted small">Refaça seus erros ou treine só um tema</span>
          </span>
        </button>
        <button className="card tool" onClick={go(onProgress)}>
          <span className="tool-icon"><Icon name="chart" /></span>
          <span className="tool-text">
            <strong>Meu desempenho</strong>
            <span className="muted small">Evolução, temas a reforçar e prontidão</span>
          </span>
        </button>
        <button className="card tool" onClick={go(onPlan)}>
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

      {starting && (
        <StartDialog
          cert={starting}
          onCancel={() => setStarting(null)}
          onStart={(f) => {
            const c = starting;
            setStarting(null);
            onStart(c, f);
          }}
        />
      )}

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
