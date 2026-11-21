import { useEffect, useMemo, useState } from 'react';
import type { AttemptRecord, Cert } from '../types';
import { EXAMS } from '../lib/exam';
import { aggregateTopics, toStats } from '../lib/analysis';
import { REVIEW_RULES, buildPlan, fmtMin } from '../lib/plan';
import { loadPlanPrefs, savePlanPrefs, type PlanPrefs } from '../lib/storage';
import { loadQuestions } from '../data/source';
import { LevelTag } from './ui';

interface Props {
  cert: Cert;
  history: AttemptRecord[];
  onBack: () => void;
  onCert: (c: Cert) => void;
}

const fmtDate = (d?: Date) => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

export function Plan({ cert, history, onBack, onCert }: Props) {
  const cfg = EXAMS[cert];
  const [prefs, setPrefs] = useState<PlanPrefs>(() => loadPlanPrefs());
  const [bankTopics, setBankTopics] = useState<string[] | null>(null);
  const [printMsg, setPrintMsg] = useState('');

  useEffect(() => {
    let alive = true;
    loadQuestions(cert)
      .then((b) => alive && setBankTopics([...new Set(b.questions.map((q) => q.topic))]))
      .catch(() => alive && setBankTopics([]));
    return () => {
      alive = false;
    };
  }, [cert]);

  useEffect(() => savePlanPrefs(prefs), [prefs]);

  const stats = useMemo(() => toStats(aggregateTopics(history, cert), bankTopics ?? []), [history, cert, bankTopics]);
  const plan = useMemo(
    () => buildPlan({ cfg, stats, daysPerWeek: prefs.daysPerWeek, minutesPerDay: prefs.minutesPerDay, examDate: prefs.examDate }),
    [cfg, stats, prefs],
  );

  const print = () => {
    setPrintMsg('');
    try {
      window.print();
    } catch {
      setPrintMsg('Não foi possível abrir a impressão aqui. Abra o app no navegador do computador e use Ctrl+P (ou Cmd+P).');
    }
  };

  if (bankTopics === null) {
    return (
      <div className="card skeleton-card" aria-busy="true" aria-label="Montando o plano">
        <div className="sk sk-title" />
        <div className="sk sk-line" />
        <div className="sk sk-opt" />
        <div className="sk sk-opt" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="card empty">
        <h2>Sem temas para montar o plano</h2>
        <p className="muted">Não há questões cadastradas para {cfg.label}.</p>
        <button className="btn" onClick={onBack}>Voltar</button>
      </div>
    );
  }

  return (
    <div className="stack plan">
      <div className="row row-between no-print">
        <h1>Plano de estudos</h1>
        <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
      </div>
      <div className="tabs no-print" role="tablist" aria-label="Certificação">
        {(Object.keys(EXAMS) as Cert[]).map((c) => (
          <button key={c} role="tab" aria-selected={c === cert} className={c === cert ? 'tab tab-on' : 'tab'} onClick={() => onCert(c)}>
            {EXAMS[c].label}
          </button>
        ))}
      </div>
      <h1 className="print-only">Plano de estudos — {cfg.label}</h1>
      <p className="print-only muted">
        Gerado em {new Date().toLocaleDateString('pt-BR')} a partir do desempenho nos simulados. Material de estudo independente, sem vínculo com a Anbima.
      </p>

      <section className="card no-print" aria-labelledby="cfg-title">
        <h2 id="cfg-title">Sua rotina ({cfg.label})</h2>
        <div className="form">
          <label>
            Dias de estudo por semana
            <select value={prefs.daysPerWeek} onChange={(e) => setPrefs({ ...prefs, daysPerWeek: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} dias</option>)}
            </select>
          </label>
          <label>
            Tempo por dia
            <select value={prefs.minutesPerDay} onChange={(e) => setPrefs({ ...prefs, minutesPerDay: Number(e.target.value) })}>
              {[30, 45, 60, 90, 120, 150, 180].map((n) => <option key={n} value={n}>{fmtMin(n)}</option>)}
            </select>
          </label>
          <label>
            Data da prova (opcional)
            <input type="date" value={prefs.examDate} onChange={(e) => setPrefs({ ...prefs, examDate: e.target.value })} />
          </label>
        </div>
        <p className="muted small">O plano muda sozinho conforme você ajusta e depois de cada simulado.</p>
      </section>

      {plan.warnings.length > 0 && (
        <div className="banner banner-warn plan-warn" role="note">
          {plan.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <section className="card">
        <h2>Resumo</h2>
        <p>
          <strong>{prefs.daysPerWeek} dias × {fmtMin(prefs.minutesPerDay)}</strong> = {fmtMin(plan.weeklyMinutes)} por semana.
          {plan.weeksLeft !== null && <> Faltam cerca de <strong>{plan.weeksLeft} semanas</strong> para a prova.</>}
        </p>
        <p className="muted small">Meta da prova: {cfg.total} questões em {fmtMin(cfg.minutes)}, com no mínimo {Math.round(cfg.passPct * 100)}% de acertos.</p>
      </section>

      <section className="card">
        <h2>Ciclo de estudos (1 ciclo = 1 semana)</h2>
        <p className="muted small">Mais tempo para os temas mais fracos. Ao terminar, recomece do primeiro tema.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Tema e foco</th><th>Tempo</th><th>Nível</th></tr>
            </thead>
            <tbody>
              {plan.cycle.map((b, i) => (
                <tr key={b.topic}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{b.topic}</strong>
                    <div className="small muted">{b.focus}</div>
                  </td>
                  <td className="nowrap">{fmtMin(b.minutes)}</td>
                  <td><LevelTag level={b.level} known={b.known} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Semana tipo</h2>
        <ul className="week">
          {plan.week.map((d) => (
            <li key={d.day} className={d.kind === 'simulado' ? 'day day-sim' : 'day'}>
              <div className="day-head">
                <strong>{d.day}</strong>
                <span className="muted small">{fmtMin(d.minutes)}</span>
              </div>
              {d.kind === 'simulado' ? (
                <p className="small">{d.note}</p>
              ) : (
                <ul className="slots">
                  {d.slots.map((s, i) => (
                    <li key={i}>
                      <span>{s.topic}</span>
                      <span className="muted nowrap">{fmtMin(s.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Fases até a prova</h2>
        <ol className="phases">
          {plan.phases.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong>
              {p.from && p.to && <span className="muted small"> · {fmtDate(p.from)} a {fmtDate(p.to)}</span>}
              <p className="small">{p.goal}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Revisão dos erros (repetição espaçada)</h2>
        <ul className="plain">
          {REVIEW_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <h2 style={{ marginTop: 14 }}>Dicas para o dia da prova</h2>
        <ul className="plain">
          <li>Média de {Math.round((cfg.minutes * 60) / cfg.total)} s por questão. Se passar muito disso, marque e volte depois.</li>
          <li>Treine com cronômetro: faça os simulados completos no tempo real.</li>
        </ul>
      </section>

      <div className="no-print">
        <button className="btn btn-primary btn-block" onClick={print}>🖨 Imprimir ou salvar em PDF</button>
        {printMsg && <p className="small muted" role="status">{printMsg}</p>}
        <p className="small muted">Na janela de impressão, escolha "Salvar como PDF" no destino.</p>
      </div>
    </div>
  );
}
