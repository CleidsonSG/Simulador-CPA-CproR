import { useEffect, useRef, useState } from 'react';
import type { Cert, Feedback } from '../types';
import { EXAMS } from '../lib/exam';
import { loadFeedback, saveFeedback } from '../lib/storage';

const OPTIONS: { v: Feedback; title: string; text: string; points: string[] }[] = [
  {
    v: 'imediata',
    title: 'Correção a cada questão',
    text: 'Você vê na hora se acertou, com a explicação.',
    points: ['Bom para aprender enquanto treina', 'Não dá para voltar nem trocar a resposta'],
  },
  {
    v: 'final',
    title: 'Correção no final',
    text: 'Como na prova real: sem correção durante a prova.',
    points: ['Avance, volte e troque respostas até finalizar', 'No fim, todas as questões comentadas'],
  },
];

/** Antes do simulado: escolher quando ver a correção. Lembra a última escolha. */
export function StartDialog({ cert, onStart, onCancel }: { cert: Cert; onStart: (f: Feedback) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Feedback>(() => loadFeedback());
  const cfg = EXAMS[cert];

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
  }, []);

  const start = () => {
    saveFeedback(choice);
    onStart(choice);
  };

  return (
    <dialog
      ref={ref}
      className="dialog start-dialog"
      aria-labelledby="start-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="start-title">Simulado {cfg.label}</h2>
      <p className="muted small">
        {cfg.total} questões · 2h30 · aprovação com {Math.round(cfg.passPct * 100)}%. Quando você quer ver a correção?
      </p>
      <div className="start-options" role="radiogroup" aria-label="Quando ver a correção">
        {OPTIONS.map((o) => (
          <label key={o.v} className={choice === o.v ? 'start-opt is-on' : 'start-opt'}>
            <input type="radio" name="feedback" value={o.v} checked={choice === o.v} onChange={() => setChoice(o.v)} />
            <span className="start-opt-body">
              <strong>{o.title}</strong>
              <span className="small">{o.text}</span>
              <ul className="small muted">
                {o.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </span>
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={start} autoFocus>Começar simulado</button>
      </div>
    </dialog>
  );
}
