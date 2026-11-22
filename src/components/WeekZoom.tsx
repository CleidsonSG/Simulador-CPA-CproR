import { useLayoutEffect, useRef, useState } from 'react';
import type { Block } from '../lib/plan';
import { fmtMin } from '../lib/plan';
import { useWidth } from './charts';

type Group = 'critico' | 'atencao' | 'none' | 'ok';
const ORDER: Group[] = ['critico', 'atencao', 'none', 'ok'];
const LABEL: Record<Group, string> = { critico: 'Crítico', atencao: 'Atenção', none: 'Sem dados', ok: 'Bom' };
const ICON: Record<Group, string> = { critico: '▲', atencao: '●', none: '○', ok: '✓' };
const groupOf = (b: Block): Group => (b.known ? b.level : 'none');
const SHOW = 10;

interface Props {
  cycle: Block[];
  /** Acerto do tema (0–1), ou null sem questões respondidas. */
  accOf: (topic: string) => number | null;
  /** Nota de corte (0–1). */
  passPct: number;
  /** Tema destacado no ciclo e na semana (o mesmo estado da tela do plano). */
  picked: string | null;
  onPick: (topic: string | null) => void;
}

/**
 * "Sua semana de estudo": barra do tempo por nível; tocar num nível abre, logo abaixo e ligado a ele,
 * a lista dos temas desse nível com o acerto contra a nota de corte e o tempo semanal.
 */
export function WeekZoom({ cycle, accOf, passPct, picked, onPick }: Props) {
  const groups = ORDER.map((g) => ({ g, items: cycle.filter((b) => groupOf(b) === g) }))
    .filter((x) => x.items.length > 0)
    .map((x) => ({ ...x, minutes: x.items.reduce((s, b) => s + b.minutes, 0) }));
  const [open, setOpen] = useState<Group | null>(null); // começa recolhido; o usuário abre o nível que quiser
  const [all, setAll] = useState(false);
  const [box, width] = useWidth<HTMLDivElement>();
  const barRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<{ x1: number; x2: number } | null>(null);
  const cur = groups.find((x) => x.g === open) ?? null;
  const cut = Math.round(passPct * 100);

  // posição do nível aberto na barra, para o "funil" que liga a barra à lista
  useLayoutEffect(() => {
    const bar = barRef.current;
    const seg = bar?.querySelector<HTMLElement>(`[data-g="${open}"]`);
    if (!bar || !seg) return setSpan(null);
    const br = bar.getBoundingClientRect();
    const sr = seg.getBoundingClientRect();
    setSpan({ x1: sr.left - br.left, x2: sr.right - br.left });
  }, [open, width, cycle]);

  const toggle = (g: Group) => {
    setAll(false);
    setOpen(open === g ? null : g);
  };
  const items = cur ? (all ? cur.items : cur.items.slice(0, SHOW)) : [];

  return (
    <div className="wz" ref={box}>
      <div className={`wz-bar${open ? ' wz-dim' : ''}`} ref={barRef}>
        {groups.map((x) => (
          <button
            key={x.g}
            type="button"
            data-g={x.g}
            className={`wz-seg seg-${x.g}${open === x.g ? ' is-on' : ''}`}
            style={{ flexGrow: x.minutes }}
            aria-expanded={open === x.g}
            aria-label={`${LABEL[x.g]}: ${x.items.length} temas, ${fmtMin(x.minutes)} por semana. ${open === x.g ? 'Fechar' : 'Abrir'} a lista.`}
            onClick={() => toggle(x.g)}
          />
        ))}
      </div>
      <div className="wz-legend">
        {groups.map((x) => (
          <button key={x.g} type="button" className={`wz-key${open === x.g ? ' is-on' : ''}`} onClick={() => toggle(x.g)} aria-pressed={open === x.g}>
            <i className={`sw seg-${x.g}`} /> {ICON[x.g]} {LABEL[x.g]} · <b className="num">{fmtMin(x.minutes)}</b>
          </button>
        ))}
      </div>

      {!cur && <p className="small muted no-print wz-hint">Toque num nível acima para ver os temas.</p>}

      {cur && (
        <div className="wz-zoom no-print" key={cur.g}>
          {span && width > 0 && (
            <svg className={`wz-link seg-${cur.g}`} width={width} height={22} viewBox={`0 0 ${width} 22`} preserveAspectRatio="none" aria-hidden="true">
              <path d={`M${span.x1},0 L${span.x2},0 L${width},22 L0,22 Z`} />
            </svg>
          )}
          <div className="wz-head">
            <strong>
              {ICON[cur.g]} {LABEL[cur.g]}: {cur.items.length} {cur.items.length === 1 ? 'tema' : 'temas'}, {fmtMin(cur.minutes)} por semana
            </strong>
            <button type="button" className="chip-btn" onClick={() => setOpen(null)}>Fechar</button>
          </div>
          <div className="wz-cols" aria-hidden="true">
            <span>Tema</span>
            <span>Acerto · <span className="wz-cut-label">corte {cut}%</span></span>
            <span>Tempo</span>
          </div>
          <ul className="wz-rows">
            {items.map((b, i) => {
              const acc = accOf(b.topic);
              const n = cycle.indexOf(b) + 1;
              return (
                <li key={b.topic} style={{ animationDelay: `${i * 0.035}s` }}>
                  <button
                    type="button"
                    className={`wz-row${picked === b.topic ? ' is-picked' : ''}`}
                    onClick={() => onPick(picked === b.topic ? null : b.topic)}
                    aria-pressed={picked === b.topic}
                    aria-label={`${n}. ${b.topic}: acerto ${acc === null ? 'sem dados' : Math.round(acc * 100) + '%'}, ${fmtMin(b.minutes)} por semana. Destacar no ciclo e na semana.`}
                  >
                    <span className="wz-name" title={b.topic}>
                      <span className="cycle-n num">{n}.</span> {b.topic}
                    </span>
                    <span className="wz-track">
                      {acc !== null && <i className={`seg-${cur.g}`} style={{ width: `${Math.max(acc * 100, 1.5)}%` }} />}
                      <b style={{ left: `${cut}%` }} />
                    </span>
                    <span className="wz-val num">
                      {acc === null ? '—' : `${Math.round(acc * 100)}%`} · {b.minutes}m
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cur.items.length > SHOW && (
            <button type="button" className="chip-btn wz-more" onClick={() => setAll(!all)}>
              {all ? 'Mostrar menos' : `Ver todos os ${cur.items.length} temas`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
