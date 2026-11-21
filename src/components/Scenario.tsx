import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapBody } from '../types';
import { gerenteLine, sanitizeHtml, typingDelay, walkMap, type MapStep } from '../lib/scenario';
import { storageImagePrefix } from '../lib/supabase';

const LETTERS = ['A', 'B', 'C', 'D'];

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Texto-base do caso. O HTML vem do banco e sempre passa pelo sanitizador. */
export function CaseText({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeHtml(html, storageImagePrefix), [html]);
  return <div className="case-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function Bubble({ who, children }: { who: 'cliente' | 'gerente'; children: ReactNode }) {
  return (
    <li className={`bubble bubble-${who}`}>
      <span className="bubble-who">{who === 'cliente' ? 'Cliente' : 'Você (gerente)'}</span>
      <span className="bubble-text">{children}</span>
    </li>
  );
}

/** Conversa já feita, só leitura (usada para rever o mapa nas questões e no resultado). */
export function MapTranscript({ body, path }: { body: MapBody; path: readonly number[] }) {
  const { steps, ended } = walkMap(body, path);
  const last = steps[steps.length - 1];
  return (
    <div className="chat chat-static">
      <p className="chat-intro">{body.intro}</p>
      <ul className="chat-log">
        {steps.map((s, i) => (
          <StepBubbles key={`${s.key}-${i}`} step={s} />
        ))}
      </ul>
      {ended && last?.node.endText && <p className="chat-end">{last.node.endText}</p>}
    </div>
  );
}

function StepBubbles({ step, showClient = true }: { step: MapStep; showClient?: boolean }) {
  return (
    <>
      {showClient && <Bubble who="cliente">{step.node.client}</Bubble>}
      {step.choice !== undefined && <Bubble who="gerente">{gerenteLine(step.node, step.choice)}</Bubble>}
    </>
  );
}

interface MapChatProps {
  title: string;
  body: MapBody;
  path: number[];
  onPath: (path: number[]) => void;
  onDone: () => void;
}

/**
 * Mapa de decisão como conversa: o cliente "digita" (atraso proporcional ao texto), você escolhe
 * uma das 4 respostas, e a conversa segue para o ramo correspondente. "Voltar" desfaz a última resposta.
 * As respostas do mapa não valem nota: só as 2 questões do conjunto, corrigidas no fim da prova.
 */
export function MapChat({ title, body, path, onPath, onDone }: MapChatProps) {
  const { steps, ended } = walkMap(body, path);
  const reduced = useMemo(prefersReduced, []);
  // Falas do cliente já exibidas. Ao voltar a um mapa já respondido, mostra tudo de uma vez.
  const [typed, setTyped] = useState(() => (path.length > 0 ? steps.length : 0));
  const shown = Math.min(typed, steps.length);
  const typing = shown < steps.length;
  const endRef = useRef<HTMLDivElement>(null);
  const firstOptRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typed > steps.length) setTyped(steps.length);
  }, [typed, steps.length]);

  // Depende só do texto (não do array `steps`, recriado a cada render): o relógio da prova
  // re-renderiza a cada segundo e não pode reiniciar o atraso de digitação.
  const pendingText = typing ? steps[shown].node.client : null;
  useEffect(() => {
    if (pendingText === null) return;
    const id = window.setTimeout(() => setTyped(shown + 1), typingDelay(pendingText, reduced));
    return () => window.clearTimeout(id);
  }, [pendingText, shown, reduced]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    if (!typing) (ended ? doneRef : firstOptRef).current?.focus({ preventScroll: true });
  }, [shown, typing, ended, reduced]);

  const current = steps[steps.length - 1];
  const waiting = !typing && !ended && current && current.choice === undefined;
  const lastNode = steps[steps.length - 1]?.node;

  return (
    <article className="card chat-card" aria-labelledby="map-title">
      <div className="q-meta">
        <span className="tag">Mapa de decisão</span>
        <span className="tag tag-soft">Sem nota nas respostas da conversa</span>
      </div>
      <h2 id="map-title">{title}</h2>
      <div className="chat">
        <p className="chat-intro">{body.intro}</p>
        <ul className="chat-log" aria-live="polite" aria-relevant="additions">
          {steps.map((s, i) => (i < shown ? <StepBubbles key={`${s.key}-${i}`} step={s} /> : null))}
          {typing && (
            <li className="bubble bubble-cliente bubble-typing" aria-label="O cliente está digitando">
              <span className="bubble-who">Cliente</span>
              <span className="dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="sr-only">digitando…</span>
            </li>
          )}
        </ul>
        {ended && !typing && lastNode?.endText && <p className="chat-end">{lastNode.endText}</p>}
        <div ref={endRef} />
      </div>

      {waiting && (
        <div className="chat-reply">
          <p className="chat-ask">{current.node.pergunta || body.pergunta}</p>
          <div className="options" role="group" aria-label="Sua resposta ao cliente">
            {current.node.options.map((opt, i) => (
              <button
                key={i}
                ref={i === 0 ? firstOptRef : undefined}
                className="option"
                onClick={() => onPath([...path, i])}
              >
                <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
                <span className="opt-text">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-actions">
        <button className="btn btn-ghost" disabled={path.length === 0} onClick={() => onPath(path.slice(0, -1))}>
          ← Voltar
        </button>
        {ended && !typing && (
          <button ref={doneRef} className="btn btn-primary" onClick={onDone}>
            Ir para as questões
          </button>
        )}
      </div>
    </article>
  );
}
