import type { Answers, ExamConfig, Question } from '../types';
import { formatClock, grade, passMark } from '../lib/exam';
import { pace, toStats } from '../lib/analysis';
import { TopicBars } from './ui';

interface Props {
  cfg: ExamConfig;
  questions: Question[];
  answers: Answers;
  usedSeconds: number;
  isSample: boolean;
  size: number;
  onRetry: () => void;
  onHome: () => void;
  onPlan: () => void;
  onProgress: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function Result({ cfg, questions, answers, usedSeconds, isSample, size, onRetry, onHome, onPlan, onProgress }: Props) {
  const g = grade(questions, answers);
  const mark = passMark(cfg, size);
  const passed = g.correct >= mark;
  const wrong = questions.filter((q) => answers[q.id] !== q.correctIndex);
  const stats = toStats(g.byTopic);
  const focus = stats.filter((s) => s.level !== 'ok').slice(0, 3);
  const answered = Object.keys(answers).length;
  const p = pace(usedSeconds, answered, cfg.minutes, cfg.total);
  const blank = questions.length - answered;

  return (
    <div className="result">
      <section className={passed ? 'card score score-ok' : 'card score score-bad'} aria-live="polite">
        <p className="muted small">{cfg.label} · tempo usado {formatClock(usedSeconds)}</p>
        <div className="score-num">
          {g.correct}
          <span>/{g.total}</span>
        </div>
        <p className="verdict">{passed ? '✓ Aprovado' : '✗ Reprovado'}</p>
        <p className="muted">
          Nota de corte: {mark} acertos ({Math.round(cfg.passPct * 100)}%). Você fez {Math.round(g.pct * 100)}%.
        </p>
        {!passed && <p className="small">Faltaram {mark - g.correct} acertos para a nota de corte.</p>}
        {isSample && <p className="small muted">Resultado com questões de exemplo.</p>}
      </section>

      <section className="card" aria-labelledby="focus-title">
        <h2 id="focus-title">Onde melhorar agora</h2>
        {focus.length === 0 ? (
          <p>Todos os temas ficaram em 70% ou mais neste simulado. Faça outro para confirmar.</p>
        ) : (
          <ol className="focus-list">
            {focus.map((s) => (
              <li key={s.topic}>
                <strong>{s.topic}</strong> — {s.correct} de {s.total} certas ({Math.round(s.acc * 100)}%)
              </li>
            ))}
          </ol>
        )}
        <p className="muted small">
          Ritmo: {Math.round(p.perQuestion)} s por questão (a prova real dá cerca de {Math.round(p.allowed)} s).
          {p.ratio > 1.1 && ' Você está mais lento que o necessário: treine resolver mais rápido.'}
          {p.ratio > 0 && p.ratio < 0.4 && ' Muito rápido: confira se está lendo todo o enunciado.'}
          {blank > 0 && ` ${blank} questão(ões) ficaram sem resposta.`}
        </p>
        <button className="btn btn-primary btn-block" onClick={onPlan}>Montar plano de estudos com este resultado</button>
      </section>

      <section className="card" aria-labelledby="topics-title">
        <h2 id="topics-title">Desempenho por tema</h2>
        <TopicBars stats={stats} />
      </section>

      <section className="card" aria-labelledby="rev-title">
        <h2 id="rev-title">Revisão dos erros ({wrong.length})</h2>
        {wrong.length === 0 ? (
          <div className="empty-inline">
            <p>Você não errou nenhuma questão. Excelente!</p>
          </div>
        ) : (
          <ol className="review">
            {wrong.map((q) => {
              const mine = answers[q.id];
              return (
                <li key={q.id}>
                  <p className="q-statement small-q">{q.statement}</p>
                  <p>
                    <span className="tag tag-bad">
                      Sua resposta: {mine === undefined ? 'em branco' : `${LETTERS[mine]}. ${q.options[mine]}`}
                    </span>
                  </p>
                  <p>
                    <span className="tag tag-ok">
                      Correta: {LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}
                    </span>
                  </p>
                  <p className="explain">{q.explanation}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="quiz-actions wrap">
        <button className="btn" onClick={onHome}>Início</button>
        <button className="btn" onClick={onProgress}>Meu desempenho</button>
        <button className="btn btn-primary" onClick={onRetry}>Novo simulado</button>
      </div>
    </div>
  );
}
