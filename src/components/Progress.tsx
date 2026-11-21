import { useState } from 'react';
import type { AttemptRecord, Cert } from '../types';
import { EXAMS } from '../lib/exam';
import { READY_TEXT, aggregateTopics, readiness, toStats } from '../lib/analysis';
import { TopicBars } from './ui';

interface Props {
  history: AttemptRecord[];
  initialCert?: Cert;
  onPlan: (cert: Cert) => void;
  onBack: () => void;
}

export function Progress({ history, initialCert = 'CPA', onPlan, onBack }: Props) {
  const [cert, setCert] = useState<Cert>(initialCert);
  const cfg = EXAMS[cert];
  const attempts = history.filter((h) => h.cert === cert).slice(0, 20).reverse(); // do mais antigo ao mais novo
  const stats = toStats(aggregateTopics(history, cert));
  const weak = stats.filter((s) => s.known && s.level !== 'ok').slice(0, 3);
  const ready = readiness(history, cert, cfg.passPct);
  const best = attempts.reduce((m, a) => Math.max(m, a.correct / a.total), 0);
  const avg = attempts.length ? attempts.reduce((s, a) => s + a.correct / a.total, 0) / attempts.length : 0;

  return (
    <div className="stack">
      <div className="row row-between">
        <h1>Meu desempenho</h1>
        <button className="btn btn-ghost no-print" onClick={onBack}>← Início</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Certificação">
        {(Object.keys(EXAMS) as Cert[]).map((c) => (
          <button key={c} role="tab" aria-selected={c === cert} className={c === cert ? 'tab tab-on' : 'tab'} onClick={() => setCert(c)}>
            {EXAMS[c].label}
          </button>
        ))}
      </div>

      {attempts.length === 0 ? (
        <section className="card empty">
          <h2>Ainda sem simulados de {cfg.label}</h2>
          <p className="muted">Faça um simulado para ver sua evolução, os temas fracos e receber um plano de estudos.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => onPlan(cert)}>Montar plano mesmo assim</button>
            <button className="btn btn-primary" onClick={onBack}>Fazer um simulado</button>
          </div>
        </section>
      ) : (
        <>
          <section className="stats" aria-label="Resumo">
            <div className="stat"><span className="stat-n">{attempts.length}</span><span className="muted small">simulados</span></div>
            <div className="stat"><span className="stat-n">{Math.round(avg * 100)}%</span><span className="muted small">média</span></div>
            <div className="stat"><span className="stat-n">{Math.round(best * 100)}%</span><span className="muted small">melhor</span></div>
            <div className="stat"><span className="stat-n">{Math.round(cfg.passPct * 100)}%</span><span className="muted small">aprovação</span></div>
          </section>

          <section className="card">
            <h2>Evolução</h2>
            <EvolutionChart attempts={attempts} passPct={cfg.passPct} />
          </section>

          <section className={`card ready ready-${ready.state}`}>
            <h2>Indicador de prontidão</h2>
            <p>
              {ready.state !== 'poucos-dados' && <strong>{Math.round(ready.avg * 100)}% · </strong>}
              {READY_TEXT[ready.state]}
            </p>
            <p className="muted small">É só uma referência, não garante aprovação. Quanto mais simulados, mais confiável.</p>
          </section>

          <section className="card">
            <h2>Onde melhorar</h2>
            {stats.length === 0 ? (
              <div className="empty-inline">Os simulados antigos não guardaram o desempenho por tema. Faça um novo simulado.</div>
            ) : (
              <>
                {weak.length > 0 ? (
                  <p>
                    Prioridade: <strong>{weak.map((w) => w.topic).join(', ')}</strong>.
                  </p>
                ) : (
                  <p>Todos os temas estão em 70% ou mais. Continue treinando para manter.</p>
                )}
                <TopicBars stats={stats} />
                <p className="muted small">Crítico: menos de 50% · Atenção: 50 a 69% · Bom: 70% ou mais. Temas com poucas questões oscilam bastante.</p>
              </>
            )}
          </section>
        </>
      )}

      <button className="btn btn-primary btn-block no-print" onClick={() => onPlan(cert)}>
        Montar meu plano de estudos
      </button>
    </div>
  );
}

function EvolutionChart({ attempts, passPct }: { attempts: AttemptRecord[]; passPct: number }) {
  const [sel, setSel] = useState(attempts.length - 1);
  const W = 320, H = 170, L = 34, R = 12, T = 12, B = 26;
  const x = (i: number) => (attempts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (attempts.length - 1));
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const pts = attempts.map((a, i) => ({ i, p: a.correct / a.total, a }));
  const cur = pts[Math.min(sel, pts.length - 1)];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Evolução da nota em ${attempts.length} simulados`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="grid-line" />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" className="axis">{Math.round(g * 100)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(passPct)} y2={y(passPct)} className="pass-line" />
        <text x={W - R} y={y(passPct) - 5} textAnchor="end" className="pass-label">aprovação {Math.round(passPct * 100)}%</text>
        {pts.length > 1 && <polyline className="line" fill="none" points={pts.map((q) => `${x(q.i)},${y(q.p)}`).join(' ')} />}
        {pts.map((q) => (
          <circle
            key={q.a.id}
            cx={x(q.i)}
            cy={y(q.p)}
            r={q.i === cur.i ? 8 : 6}
            tabIndex={0}
            role="button"
            aria-label={`Simulado ${q.i + 1}: ${Math.round(q.p * 100)}%`}
            className={q.p >= passPct ? 'dot dot-ok' : 'dot dot-bad'}
            onClick={() => setSel(q.i)}
            onMouseEnter={() => setSel(q.i)}
            onFocus={() => setSel(q.i)}
          />
        ))}
      </svg>
      <p className="chart-read" aria-live="polite">
        Simulado {cur.i + 1} · {new Date(cur.a.date).toLocaleDateString('pt-BR')} · <strong>{Math.round(cur.p * 100)}%</strong> ({cur.a.correct}/{cur.a.total}) ·{' '}
        {cur.p >= passPct ? '✓ acima da nota de corte' : '✗ abaixo da nota de corte'}
      </p>
    </div>
  );
}
