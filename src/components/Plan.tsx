import { useEffect, useMemo, useState } from 'react';
import type { AttemptRecord, Cert, Question } from '../types';
import { EXAMS } from '../lib/exam';
import { aggregateTopics, toStats } from '../lib/analysis';
import { REVIEW_RULES, buildPlan, fmtMin, type Block } from '../lib/plan';
import { loadCycleDone, loadPlanPrefs, saveCycleDone, savePlanPrefs, type PlanPrefs } from '../lib/storage';
import { loadQuestions } from '../data/source';
import { questionsPerMacro, topicWeights } from '../data/matrix';
import { CertTabs, LevelTag, Locked } from './ui';
import { WeekZoom } from './WeekZoom';

interface Props {
  cert: Cert;
  history: AttemptRecord[];
  onBack: () => void;
  onCert: (c: Cert) => void;
  /** Degustação: prévia com os 3 primeiros temas; semana, agenda e PDF bloqueados. */
  trial?: boolean;
}

const fmtDate = (d?: Date) => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const DAYS = [2, 3, 4, 5, 6, 7];
const MINUTES = [30, 45, 60, 90, 120, 150, 180];
const levelClass = (b: Pick<Block, 'level' | 'known'>) => (b.known ? `seg-${b.level}` : 'seg-none');

const LABELS = Object.fromEntries((Object.keys(EXAMS) as Cert[]).map((c) => [c, EXAMS[c].label])) as Record<Cert, string>;

export function Plan({ cert, history, onBack, onCert, trial = false }: Props) {
  const cfg = EXAMS[cert];
  const [prefs, setPrefs] = useState<PlanPrefs>(() => loadPlanPrefs());
  const [bank, setBank] = useState<Question[] | null>(null);
  const [printMsg, setPrintMsg] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>(() => loadCycleDone(cert));

  useEffect(() => {
    let alive = true;
    setBank(null);
    setDone(loadCycleDone(cert));
    setPicked(null);
    loadQuestions(cert)
      .then((b) => alive && setBank(b.questions))
      .catch(() => alive && setBank([]));
    return () => {
      alive = false;
    };
  }, [cert]);

  useEffect(() => savePlanPrefs(prefs), [prefs]);

  const bankTopics = useMemo(() => (bank ? [...new Set(bank.map((q) => q.topic))] : null), [bank]);
  const weights = useMemo(() => topicWeights(cert, bank ?? []), [cert, bank]);
  const stats = useMemo(() => toStats(aggregateTopics(history, cert), bankTopics ?? []), [history, cert, bankTopics]);
  const plan = useMemo(
    () => buildPlan({ cfg, stats, daysPerWeek: prefs.daysPerWeek, minutesPerDay: prefs.minutesPerDay, examDate: prefs.examDate, topicWeights: weights }),
    [cfg, stats, prefs, weights],
  );

  const toggleDone = (topic: string) => {
    const next = done.includes(topic) ? done.filter((t) => t !== topic) : [...done, topic];
    setDone(next);
    saveCycleDone(cert, next);
  };
  const resetCycle = () => {
    setDone([]);
    saveCycleDone(cert, []);
  };

  const print = () => {
    setPrintMsg('');
    try {
      window.print();
    } catch {
      setPrintMsg('Não foi possível abrir a impressão aqui. Abra o app no navegador do computador e use Ctrl+P (ou Cmd+P).');
    }
  };

  const tabs = (
    <CertTabs certs={Object.keys(EXAMS) as Cert[]} labels={LABELS} cert={cert} onCert={onCert} trial={trial} className="tabs no-print" />
  );

  if (bankTopics === null) {
    return (
      <div className="stack">
        {tabs}
        <div className="card skeleton-card" aria-busy="true" aria-label="Montando o plano">
          <div className="sk sk-title" />
          <div className="sk sk-line" />
          <div className="sk sk-opt" />
          <div className="sk sk-opt" />
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="stack">
        {tabs}
        <div className="card empty">
          <h2>Sem temas para montar o plano</h2>
          <p className="muted">Não há questões cadastradas para {cfg.label}.</p>
          <button className="btn" onClick={onBack}>Voltar</button>
        </div>
      </div>
    );
  }

  const cycleDone = plan.cycle.filter((b) => done.includes(b.topic)).length;
  const examDay = prefs.examDate ? new Date(`${prefs.examDate}T12:00:00`) : null;
  const accOf = (topic: string) => stats.find((s) => s.topic === topic);
  const today = new Date();
  const phaseNow = plan.phases.findIndex((p) => p.from && p.to && today >= p.from && today <= new Date(p.to.getTime() + 86400000));

  if (trial) {
    return (
      <div className="stack plan">
        <div className="row row-between">
          <h1>Plano de estudos</h1>
          <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
        </div>
        {tabs}
        <section className="card" aria-labelledby="cycle-title">
          <h2 id="cycle-title">Seu ciclo de temas (prévia)</h2>
          <p className="muted small">Os 3 primeiros temas do seu ciclo, do que pede mais tempo ao que pede menos.</p>
          <ol className="cycle">
            {plan.cycle.slice(0, 3).map((b, idx) => (
              <li key={b.topic}>
                <div className="cycle-row">
                  <span className="cycle-main">
                    <strong><span className="cycle-n num">{idx + 1}.</span> {b.topic}</strong>
                    <span className="small muted">{b.focus}</span>
                  </span>
                  <span className="cycle-side">
                    <span className="num nowrap">{fmtMin(b.minutes)}</span>
                    <LevelTag level={b.level} known={b.known} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <Locked title="Plano completo, semana, agenda e PDF">
          <section className="card">
            <h2>Sua semana de estudo</h2>
            <WeekZoom cycle={plan.cycle} accOf={() => null} passPct={cfg.passPct} picked={null} onPick={() => undefined} />
          </section>
        </Locked>
      </div>
    );
  }

  return (
    <div className={`stack plan${plan.cycle.length > 12 ? ' plan-many' : ''}`}>
      <div className="row row-between no-print">
        <h1>Plano de estudos</h1>
        <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
      </div>
      {tabs}
      <header className="print-only doc-head">
        <div className="doc-title">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <h1>Plano de estudos · {cfg.label}</h1>
            <p>{cfg.fullName}</p>
          </div>
        </div>
        <dl className="doc-meta">
          <div><dt>Rotina</dt><dd>{prefs.daysPerWeek} dias × {fmtMin(prefs.minutesPerDay)} = {fmtMin(plan.weeklyMinutes)}/semana</dd></div>
          <div><dt>Prova</dt><dd>{examDay ? `${examDay.toLocaleDateString('pt-BR')}${plan.weeksLeft !== null ? ` (${plan.weeksLeft} semanas)` : ''}` : 'data não informada'}</dd></div>
          <div><dt>Meta</dt><dd>{cfg.total} questões em {fmtMin(cfg.minutes)}, {Math.round(cfg.passPct * 100)}% de acertos</dd></div>
          <div><dt>Simulados feitos</dt><dd>{history.filter((h) => h.cert === cert).length}</dd></div>
        </dl>
      </header>

      <section className="card no-print" aria-labelledby="cfg-title">
        <h2 id="cfg-title">Sua rotina</h2>
        <div className="routine">
          <fieldset className="pick">
            <legend>Dias por semana</legend>
            <div className="chips-toggle">
              {DAYS.map((n) => (
                <button key={n} type="button" className={prefs.daysPerWeek === n ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={prefs.daysPerWeek === n} onClick={() => setPrefs({ ...prefs, daysPerWeek: n })}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="pick">
            <legend>Tempo por dia</legend>
            <div className="chips-toggle">
              {MINUTES.map((n) => (
                <button key={n} type="button" className={prefs.minutesPerDay === n ? 'chip-btn is-on' : 'chip-btn'} aria-pressed={prefs.minutesPerDay === n} onClick={() => setPrefs({ ...prefs, minutesPerDay: n })}>
                  {fmtMin(n)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="pick">
            <span className="legend">Data da prova (opcional)</span>
            <input type="date" value={prefs.examDate} onChange={(e) => setPrefs({ ...prefs, examDate: e.target.value })} />
          </label>
        </div>
        <p className="muted small">O plano se ajusta na hora e depois de cada simulado.</p>
      </section>

      {plan.warnings.length > 0 && (
        <div className="banner banner-warn plan-warn" role="note">
          {plan.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <section className="card" aria-labelledby="sum-title">
        <h2 id="sum-title">Sua semana de estudo</h2>
        <dl className="facts">
          <div><dt>Por semana</dt><dd className="num">{fmtMin(plan.weeklyMinutes)}</dd></div>
          <div><dt>Nos temas</dt><dd className="num">{fmtMin(plan.topicMinutes)}</dd></div>
          <div><dt>Até a prova</dt><dd className="num">{plan.weeksLeft !== null ? `${plan.weeksLeft} sem.` : '—'}</dd></div>
        </dl>
        <WeekZoom
          cycle={plan.cycle}
          accOf={(t) => {
            const st = accOf(t);
            return st?.known ? st.acc : null;
          }}
          passPct={cfg.passPct}
          picked={picked}
          onPick={setPicked}
        />
        <p className="plan-meta">
          <b>Meta:</b> <strong className="num">{cfg.total}</strong> questões em <strong className="num">{fmtMin(cfg.minutes)}</strong>, com{' '}
          <strong className="num">{Math.round(cfg.passPct * 100)}%</strong> de acertos.
          <br />
          <b>Peso na prova:</b>{' '}
          {questionsPerMacro(cert, cfg.total)
            .map(({ macro, questions }) => `${macro.short} ${Math.round(macro.share * 100)}% (${questions})`)
            .join('; ')}
          .
        </p>
      </section>

      <section className="card" aria-labelledby="cycle-title">
        <div className="card-head">
          <h2 id="cycle-title">Ciclo de temas</h2>
          <span className="num small muted">{cycleDone} de {plan.cycle.length} feitos</span>
        </div>
        <div className="progress cycle-progress" aria-hidden="true">
          <span style={{ width: `${(cycleDone / plan.cycle.length) * 100}%` }} />
        </div>
        <p className="muted small no-print">Um ciclo por semana, do tema com mais tempo ao com menos. Marque o que já estudou; ao terminar, recomece.</p>
        <ul className="print-only focus-key small">
          <li><b>▲ Crítico:</b> teoria do tema + questões + anotar cada erro.</li>
          <li><b>● Atenção:</b> revisar os pontos fracos + questões.</li>
          <li><b>✓ Bom:</b> revisão rápida + poucas questões.</li>
          <li><b>Sem dados:</b> estudar o básico e fazer questões para diagnosticar.</li>
          <li>Marque um quadradinho (S1 a S4) a cada semana em que estudar o tema.</li>
        </ul>
        <ol className="cycle">
          {plan.cycle.map((b, idx) => {
            const isDone = done.includes(b.topic);
            return (
              <li key={b.topic} className={`${isDone ? 'is-done' : ''}${picked === b.topic ? ' is-picked' : ''}`}>
                <label className="cycle-row">
                  <input type="checkbox" className="no-print" checked={isDone} onChange={() => toggleDone(b.topic)} />
                  <span className="cycle-main">
                    <strong><span className="cycle-n num">{idx + 1}.</span> {b.topic}</strong>
                    <span className="small muted">{b.focus}</span>
                  </span>
                  <span className="cycle-side">
                    <span className="num nowrap">{fmtMin(b.minutes)}</span>
                    <LevelTag level={b.level} known={b.known} />
                    {accOf(b.topic)?.known && <span className="num small muted acc">acerto {Math.round((accOf(b.topic)?.acc ?? 0) * 100)}%</span>}
                  </span>
                  <span className="print-only weeks" aria-hidden="true">
                    {[1, 2, 3, 4].map((w) => <i key={w}>S{w}</i>)}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
        {cycleDone > 0 && (
          <button className="btn btn-ghost small-btn no-print" onClick={resetCycle}>
            {cycleDone === plan.cycle.length ? 'Ciclo completo! Recomeçar' : 'Desmarcar tudo'}
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="week-title">
        <h2 id="week-title">Semana tipo</h2>
        <ul className="week">
          {plan.week.map((d) => (
            <li key={d.day} className={d.kind === 'simulado' ? 'day day-sim' : 'day'}>
              <div className="day-head">
                <strong>{d.day}</strong>
                <span className="muted small num">{fmtMin(d.minutes)}</span>
              </div>
              {d.kind === 'simulado' ? (
                <p className="small">{d.note}</p>
              ) : (
                <>
                  <div className="day-bar" aria-hidden="true">
                    {d.slots.map((s, i) => {
                      const b = plan.cycle.find((c) => c.topic === s.topic);
                      return <span key={i} className={`${b ? levelClass(b) : 'seg-none'}${picked && picked !== s.topic ? ' is-dim' : ''}`} style={{ flexGrow: s.minutes }} />;
                    })}
                  </div>
                  <ul className="slots">
                    {d.slots.map((s, i) => (
                      <li key={i} className={picked === s.topic ? 'is-picked' : picked ? 'is-dim' : ''}>
                        <button type="button" className="slot-btn" onClick={() => setPicked(picked === s.topic ? null : s.topic)}>
                          <span className="slot-n num">{plan.cycle.findIndex((c) => c.topic === s.topic) + 1}.</span> <span className="slot-name">{s.topic}</span>
                        </button>
                        <span className="muted nowrap num">{fmtMin(s.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="phases-title">
        <h2 id="phases-title">Fases até a prova</h2>
        <ol className="timeline">
          {plan.phases.map((p, i) => (
            <li key={p.name} className={i === phaseNow ? 'is-now' : i < phaseNow ? 'is-past' : ''}>
              <div className="tl-head">
                <strong>{p.name}</strong>
                {i === phaseNow && <span className="tag">Você está aqui</span>}
                {p.from && p.to && <span className="muted small">{fmtDate(p.from)} a {fmtDate(p.to)}</span>}
              </div>
              <p className="small">{p.goal}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card two-col" aria-label="Revisão e dicas">
        <div>
          <h2>Revisão dos erros</h2>
          <ol className="steps small">
            {REVIEW_RULES.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </div>
        <div>
          <h2>No dia da prova</h2>
          <ul className="plain small">
            <li>Média de {Math.round((cfg.minutes * 60) / cfg.total)} s por questão. Se passar muito disso, marque e volte depois.</li>
            <li>Treine com cronômetro: faça os simulados completos no tempo real.</li>
          </ul>
        </div>
      </section>

      <div className="no-print">
        <button className="btn btn-primary btn-block" onClick={print}>Imprimir ou salvar em PDF</button>
        {printMsg && <p className="small muted" role="status">{printMsg}</p>}
        <p className="small muted">Na janela de impressão, escolha "Salvar como PDF" no destino.</p>
      </div>
    </div>
  );
}
