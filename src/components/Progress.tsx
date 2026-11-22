import { useMemo, useState } from 'react';
import type { AttemptRecord, Cert } from '../types';
import { EXAMS } from '../lib/exam';
import { LEVEL_LABEL, READY_TEXT, aggregateTopics, readiness, sortTopics, summarize, toStats, type Level, type TopicSort } from '../lib/analysis';
import { CertTabs, LevelTag, Locked } from './ui';
import { EvolutionChart, ReadinessMeter } from './charts';

interface Props {
  history: AttemptRecord[];
  initialCert?: Cert;
  onPlan: (cert: Cert) => void;
  onTrain: (cert: Cert, topic: string) => void;
  onBack: () => void;
  /** Degustação: só CPA e só o resumo; evolução, prontidão e temas ficam bloqueados. */
  trial?: boolean;
}

type Range = 5 | 10 | 0;
const RANGES: { v: Range; label: string }[] = [
  { v: 5, label: 'Últimos 5' },
  { v: 10, label: 'Últimos 10' },
  { v: 0, label: 'Todos' },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtSec = (sec: number) => {
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

const LABELS = Object.fromEntries((Object.keys(EXAMS) as Cert[]).map((c) => [c, EXAMS[c].label])) as Record<Cert, string>;

export function Progress({ history, initialCert = 'CPA', onPlan, onTrain, onBack, trial = false }: Props) {
  const [cert, setCert] = useState<Cert>(initialCert);
  const [range, setRange] = useState<Range>(10);
  const [asTable, setAsTable] = useState(false);
  const cfg = EXAMS[cert];

  const all = useMemo(() => history.filter((h) => h.cert === cert).slice().reverse(), [history, cert]); // antigo → novo
  const attempts = range ? all.slice(-range) : all;
  const sum = summarize(all);
  const stats = useMemo(() => toStats(aggregateTopics(history, cert)), [history, cert]);
  const ready = readiness(history, cert, cfg.passPct);
  const allowed = (cfg.minutes * 60) / cfg.total;

  return (
    <div className="stack perf">
      <div className="row row-between">
        <h1>Meu desempenho</h1>
        <button className="btn btn-ghost no-print" onClick={onBack}>← Início</button>
      </div>

      <CertTabs certs={Object.keys(EXAMS) as Cert[]} labels={LABELS} cert={cert} onCert={setCert} trial={trial} />

      {all.length === 0 ? (
        <section className="card empty">
          <h2>Ainda sem simulados de {cfg.label}</h2>
          <p className="muted">Faça um simulado para ver sua evolução, os temas a reforçar e receber um plano de estudos.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => onPlan(cert)}>Montar plano mesmo assim</button>
            <button className="btn btn-primary" onClick={onBack}>Fazer um simulado</button>
          </div>
        </section>
      ) : (
        <>
          <section className="kpis" aria-label="Indicadores">
            <Kpi label="Último simulado" value={pct(sum.last)} ok={sum.last >= cfg.passPct}>
              {sum.delta !== null && (
                <span className={sum.delta >= 0 ? 'delta delta-up' : 'delta delta-down'}>
                  {sum.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(sum.delta * 100))} pts
                </span>
              )}
            </Kpi>
            <Kpi label="Média" value={pct(sum.avg)} ok={sum.avg >= cfg.passPct} />
            <Kpi label="Melhor nota" value={pct(sum.best)} ok={sum.best >= cfg.passPct} />
            <Kpi label="Aprovação" value={`${Math.round(sum.passRate * sum.count)}/${sum.count}`}>
              <span className="muted small">simulados</span>
            </Kpi>
            <Kpi
              label="Tempo por questão"
              value={sum.secPerQuestion === null ? '—' : fmtSec(sum.secPerQuestion)}
              ok={sum.secPerQuestion === null ? undefined : sum.secPerQuestion <= allowed}
            >
              <span className="muted small">limite {fmtSec(allowed)}</span>
            </Kpi>
          </section>

          {trial ? (
            <Locked title="Evolução, prontidão e temas a reforçar">
            <section className="card" aria-labelledby="evo-title">
              <div className="card-head">
                <h2 id="evo-title">Evolução das notas</h2>
                <div className="row row-tight">
                  {all.length > 5 && (
                    <div className="chips-toggle" role="group" aria-label="Período">
                      {RANGES.filter((r) => r.v === 0 || r.v < all.length).map((r) => (
                        <button key={r.v} className={range === r.v ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={range === r.v} onClick={() => setRange(r.v)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="chip-btn" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
                    {asTable ? 'Ver gráfico' : 'Ver tabela'}
                  </button>
                </div>
              </div>
              {asTable ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Data</th><th>Acertos</th><th>Nota</th><th>Resultado</th></tr>
                    </thead>
                    <tbody>
                      {attempts.map((a, i) => (
                        <tr key={a.id}>
                          <td>{all.length - attempts.length + i + 1}</td>
                          <td>{new Date(a.date).toLocaleDateString('pt-BR')}</td>
                          <td className="num">{a.correct}/{a.total}</td>
                          <td className="num">{pct(a.correct / a.total)}</td>
                          <td>{a.passed ? '✓ Aprovado' : '✗ Reprovado'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EvolutionChart attempts={attempts} passPct={cfg.passPct} />
              )}
            </section>
  
            <section className={`card ready ready-${ready.state}`} aria-labelledby="ready-title">
              <div className="card-head">
                <h2 id="ready-title">Prontidão para a prova</h2>
                {ready.state !== 'poucos-dados' && <strong className="num ready-n">{pct(ready.avg)}</strong>}
              </div>
              <ReadinessMeter value={ready.state === 'poucos-dados' ? null : ready.avg} passPct={cfg.passPct} />
              <p>{READY_TEXT[ready.state]}</p>
              <p className="muted small">É uma referência, não garante aprovação. Quanto mais simulados, mais confiável.</p>
            </section>
  
            <TopicExplorer stats={stats} onTrain={(t) => onTrain(cert, t)} />
              </Locked>
          ) : (
            <>
            <section className="card" aria-labelledby="evo-title">
              <div className="card-head">
                <h2 id="evo-title">Evolução das notas</h2>
                <div className="row row-tight">
                  {all.length > 5 && (
                    <div className="chips-toggle" role="group" aria-label="Período">
                      {RANGES.filter((r) => r.v === 0 || r.v < all.length).map((r) => (
                        <button key={r.v} className={range === r.v ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={range === r.v} onClick={() => setRange(r.v)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="chip-btn" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
                    {asTable ? 'Ver gráfico' : 'Ver tabela'}
                  </button>
                </div>
              </div>
              {asTable ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Data</th><th>Acertos</th><th>Nota</th><th>Resultado</th></tr>
                    </thead>
                    <tbody>
                      {attempts.map((a, i) => (
                        <tr key={a.id}>
                          <td>{all.length - attempts.length + i + 1}</td>
                          <td>{new Date(a.date).toLocaleDateString('pt-BR')}</td>
                          <td className="num">{a.correct}/{a.total}</td>
                          <td className="num">{pct(a.correct / a.total)}</td>
                          <td>{a.passed ? '✓ Aprovado' : '✗ Reprovado'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EvolutionChart attempts={attempts} passPct={cfg.passPct} />
              )}
            </section>
  
            <section className={`card ready ready-${ready.state}`} aria-labelledby="ready-title">
              <div className="card-head">
                <h2 id="ready-title">Prontidão para a prova</h2>
                {ready.state !== 'poucos-dados' && <strong className="num ready-n">{pct(ready.avg)}</strong>}
              </div>
              <ReadinessMeter value={ready.state === 'poucos-dados' ? null : ready.avg} passPct={cfg.passPct} />
              <p>{READY_TEXT[ready.state]}</p>
              <p className="muted small">É uma referência, não garante aprovação. Quanto mais simulados, mais confiável.</p>
            </section>
  
            <TopicExplorer stats={stats} onTrain={(t) => onTrain(cert, t)} />
              </>
          )}
        </>
      )}

      <button className="btn btn-primary btn-block no-print" onClick={() => onPlan(cert)}>
        Montar meu plano de estudos
      </button>
    </div>
  );
}

function Kpi({ label, value, ok, children }: { label: string; value: string; ok?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`kpi${ok === undefined ? '' : ok ? ' kpi-ok' : ' kpi-bad'}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-n num">
        {value}
        {ok !== undefined && <span className="kpi-icon" aria-label={ok ? 'dentro da meta' : 'abaixo da meta'}>{ok ? '✓' : '!'}</span>}
      </span>
      {children && <span className="kpi-foot">{children}</span>}
    </div>
  );
}

const SORTS: { v: TopicSort; label: string }[] = [
  { v: 'fraco', label: 'Mais fracos' },
  { v: 'volume', label: 'Mais respondidos' },
  { v: 'az', label: 'A–Z' },
];
const LEVELS: (Level | 'todos')[] = ['todos', 'critico', 'atencao', 'ok'];

/** "Onde melhorar": filtros por nível, ordenação e cada tema abre com o detalhe e o atalho para treinar. */
function TopicExplorer({ stats, onTrain }: { stats: ReturnType<typeof toStats>; onTrain: (topic: string) => void }) {
  const [sort, setSort] = useState<TopicSort>('fraco');
  const [level, setLevel] = useState<Level | 'todos'>('todos');
  const [open, setOpen] = useState<string | null>(null);
  const count = (l: Level | 'todos') => (l === 'todos' ? stats.length : stats.filter((s) => s.known && s.level === l).length);
  const list = sortTopics(stats, sort, level);
  const weak = sortTopics(stats, 'fraco').filter((s) => s.known && s.level !== 'ok').slice(0, 3);

  return (
    <section className="card" aria-labelledby="topics-title">
      <h2 id="topics-title">Onde melhorar</h2>
      {stats.length === 0 ? (
        <div className="empty-inline">Os simulados antigos não guardaram o desempenho por tema. Faça um novo simulado.</div>
      ) : (
        <>
          <p>
            {weak.length > 0 ? (
              <>Comece por <strong>{weak.map((w) => w.topic).join(', ')}</strong>.</>
            ) : (
              'Todos os temas estão em 70% ou mais. Continue treinando para manter.'
            )}
          </p>
          <div className="filters">
            <div className="chips-toggle" role="group" aria-label="Filtrar por nível">
              {LEVELS.map((l) => (
                <button key={l} className={level === l ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={level === l} onClick={() => setLevel(l)} disabled={count(l) === 0 && l !== 'todos'}>
                  {l === 'todos' ? 'Todos' : LEVEL_LABEL[l]} <span className="chip-n">{count(l)}</span>
                </button>
              ))}
            </div>
            <label className="sort">
              <span className="muted small">Ordenar</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as TopicSort)}>
                {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <ul className="topic-list">
            {list.map((t) => {
              const p = Math.round(t.acc * 100);
              const isOpen = open === t.topic;
              return (
                <li key={t.topic} className={isOpen ? 'is-open' : ''}>
                  <button className="topic-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.topic)}>
                    <span className="topic-name">{t.topic}</span>
                    <span className="topic-right">
                      <span className="num">{t.known ? `${p}%` : '—'}</span>
                      <LevelTag level={t.level} known={t.known} />
                    </span>
                    <span className={`bar bar-${t.known ? t.level : 'none'}`} aria-hidden="true">
                      <span style={{ width: `${t.known ? p : 0}%` }} />
                      <i className="bar-cut" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="topic-detail">
                      <p className="small">
                        {t.known ? (
                          <>Você acertou <strong>{t.correct} de {t.total}</strong> questões deste tema{t.total < 5 ? ' (poucas questões: o número ainda oscila)' : ''}.</>
                        ) : (
                          'Ainda sem questões respondidas deste tema.'
                        )}
                      </p>
                      <button className="btn btn-primary small-btn" onClick={() => onTrain(t.topic)}>Treinar este tema (10 questões)</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted small">Crítico: menos de 50% · Atenção: 50 a 69% · Bom: 70% ou mais. A marca na barra é a nota de corte.</p>
        </>
      )}
    </section>
  );
}
