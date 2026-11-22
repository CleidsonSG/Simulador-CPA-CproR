import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { AttemptRecord } from '../types';

/** Largura real do contêiner (o SVG desenha em pixels de verdade: texto e traços não escalam). */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

/* ───────────── Evolução das notas ───────────── */

interface EvoProps {
  /** Do mais antigo ao mais novo. */
  attempts: AttemptRecord[];
  passPct: number;
}

/**
 * Linha das notas com a nota de corte como referência. Uma série só: sem legenda (o título nomeia).
 * Interação: passar o mouse/dedo mostra a mira e o cartão do simulado; setas ← → percorrem pelo teclado.
 */
export function EvolutionChart({ attempts, passPct }: EvoProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const n = attempts.length;
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [n]);

  const H = width < 480 ? 210 : 250;
  const L = 36, R = 14, T = 16, B = 30;
  const iw = Math.max(10, width - L - R);
  const x = (i: number) => (n === 1 ? L + iw / 2 : L + (i * iw) / (n - 1));
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const pts = attempts.map((a, i) => ({ i, p: a.total ? a.correct / a.total : 0, a }));
  const shown = sel ?? n - 1;
  const cur = pts[Math.min(shown, n - 1)];
  const line = pts.map((q) => `${x(q.i)},${y(q.p)}`).join(' ');
  const area = n > 1 ? `M${x(0)},${y(0)} L${line.replace(/ /g, ' L')} L${x(n - 1)},${y(0)} Z` : '';
  // rótulos do eixo x: no máximo ~6, sempre o primeiro e o último
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const xTicks = pts.filter((q) => (q.i % step === 0 && (q.i === n - 1 || x(n - 1) - x(q.i) >= 96)) || q.i === n - 1);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n === 1 ? 0 : Math.round(((px - L) / iw) * (n - 1));
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setSel(Math.max(0, Math.min(n - 1, shown + (e.key === 'ArrowLeft' ? -1 : 1))));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setSel(e.key === 'Home' ? 0 : n - 1);
    }
  };

  const tipLeft = Math.min(Math.max(x(cur.i), 90), width - 90);
  // cartão fica na metade do gráfico oposta ao ponto, para nunca cobri-lo nem sair do quadro
  const pointHigh = y(cur.p) < (T + H - B) / 2;
  const tipTop = pointHigh ? H - B - 96 : T;
  const ok = cur.p >= passPct;
  const prev = cur.i > 0 ? pts[cur.i - 1].p : null;

  return (
    <div className="evo" ref={box}>
      <svg
        width={width}
        height={H}
        className="chart"
        role="img"
        tabIndex={0}
        aria-label={`Evolução da nota em ${n} simulado(s). Use as setas para percorrer.`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSel(null)}
        onKeyDown={keys}
        onBlur={() => setSel(null)}
      >
        <defs>
          <linearGradient id="evo-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="evo-fill-top" />
            <stop offset="100%" className="evo-fill-bottom" />
          </linearGradient>
        </defs>
        {/* faixa de aprovação: tudo acima da nota de corte */}
        <rect x={L} y={y(1)} width={iw} height={y(passPct) - y(1)} className="pass-band" />
        {[0, 0.25, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={L + iw} y1={y(g)} y2={y(g)} className="grid-line" />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" className="axis">{Math.round(g * 100)}</text>
          </g>
        ))}
        <line x1={L} x2={L + iw} y1={y(passPct)} y2={y(passPct)} className="pass-line" />
        <text x={L - 8} y={y(passPct) + 4} textAnchor="end" className="pass-label">{Math.round(passPct * 100)}</text>
        {xTicks.map((q) => (
          <text key={q.a.id} x={x(q.i)} y={H - 8} textAnchor={n === 1 ? 'middle' : q.i === 0 ? 'start' : q.i === n - 1 ? 'end' : 'middle'} className="axis">
            {fmtDay(q.a.date)}
          </text>
        ))}
        {area && <path d={area} fill="url(#evo-fill)" />}
        {n > 1 && <polyline className="line" fill="none" points={line} />}
        {sel !== null && <line x1={x(cur.i)} x2={x(cur.i)} y1={T} y2={H - B} className="crosshair" />}
        {pts.map((q) => (
          <circle
            key={q.a.id}
            cx={x(q.i)}
            cy={y(q.p)}
            r={q.i === cur.i ? 6 : 4.5}
            className={`dot ${q.p >= passPct ? 'dot-ok' : 'dot-bad'}${q.i === cur.i ? ' dot-on' : ''}`}
          />
        ))}
      </svg>
      {sel !== null && (
      <div className="evo-tip" style={{ left: tipLeft, top: tipTop }}>
        <span className="muted small">Simulado {cur.i + 1} · {new Date(cur.a.date).toLocaleDateString('pt-BR')}</span>
        <strong className="num">{pct(cur.p)} <span className="muted small">({cur.a.correct}/{cur.a.total})</span></strong>
        <span className={ok ? 'tip-ok small' : 'tip-bad small'}>{ok ? '✓ Acima da nota de corte' : '✗ Abaixo da nota de corte'}</span>
        {prev !== null && (
          <span className="muted small">
            {cur.p - prev >= 0 ? '▲' : '▼'} {Math.abs(Math.round((cur.p - prev) * 100))} pontos vs. anterior
          </span>
        )}
      </div>
      )}
      <p className="evo-foot small" aria-live="polite">
        <span className="evo-key"><i /> nota de corte {pct(passPct)}</span>
        <span>
          {sel === null ? 'Último' : `Simulado ${cur.i + 1}`}: <strong className="num">{pct(cur.p)}</strong> em {new Date(cur.a.date).toLocaleDateString('pt-BR')}{' '}
          <span className={ok ? 'tip-ok' : 'tip-bad'}>{ok ? '✓' : '✗'}</span>
        </span>
      </p>
    </div>
  );
}

/* ───────────── Prontidão: média dos 3 últimos contra a nota de corte ───────────── */

export function ReadinessMeter({ value, passPct }: { value: number | null; passPct: number }) {
  return (
    <div className="meter" role="img" aria-label={value === null ? 'Sem dados suficientes' : `Média ${pct(value)}, nota de corte ${pct(passPct)}`}>
      <div className="meter-track">
        <span className="meter-cut" style={{ left: `${passPct * 100}%` }} />
        {value !== null && <span className={`meter-fill ${value >= passPct ? 'meter-ok' : 'meter-bad'}`} style={{ width: `${value * 100}%` }} />}
      </div>
      <div className="meter-scale small muted">
        <span>0</span>
        <span style={{ left: `${passPct * 100}%` }}>corte {pct(passPct)}</span>
        <span>100</span>
      </div>
    </div>
  );
}

/* ───────────── Barra empilhada (composição do ciclo) ───────────── */

export interface Segment {
  key: string;
  label: string;
  value: number;
  className: string;
  detail: string;
}

/** Barra horizontal dividida por partes; tocar/passar o mouse mostra a parte. Legenda fica a cargo de quem usa. */
export function StackedBar({ segments, onPick, picked }: { segments: Segment[]; onPick?: (key: string | null) => void; picked?: string | null }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const cur = segments.find((s) => s.key === picked) ?? null;
  return (
    <div className="stacked">
      <div className="stacked-bar" onPointerLeave={(e) => e.pointerType === 'mouse' && onPick?.(null)}>
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`stacked-seg ${s.className}${picked === s.key ? ' is-on' : ''}`}
            style={{ flexGrow: s.value, flexBasis: 0 }}
            aria-label={`${s.label}: ${s.detail}`}
            aria-pressed={picked === s.key}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onPick?.(s.key)}
            onFocus={() => onPick?.(s.key)}
            onClick={() => onPick?.(picked === s.key ? null : s.key)}
          />
        ))}
      </div>
      <p className="stacked-read small" aria-live="polite">
        {cur ? (
          <>
            <strong>{cur.label}</strong> · {cur.detail} ({Math.round((cur.value / total) * 100)}% da semana)
          </>
        ) : (
          <span className="muted">Toque numa parte da barra para ver o tema.</span>
        )}
      </p>
    </div>
  );
}
