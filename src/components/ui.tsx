import { useEffect, useRef } from 'react';
import { LEVEL_LABEL, type Level, type TopicStat } from '../lib/analysis';

export function LevelTag({ level, known = true }: { level: Level; known?: boolean }) {
  if (!known) return <span className="tag tag-soft">Sem dados</span>;
  const icon = level === 'critico' ? '▲' : level === 'atencao' ? '●' : '✓';
  return (
    <span className={`tag lvl-${level}`}>
      {icon} {LEVEL_LABEL[level]}
    </span>
  );
}

/** Barras por tema. O nível aparece em texto e ícone, não só em cor. */
export function TopicBars({ stats }: { stats: TopicStat[] }) {
  return (
    <ul className="topics">
      {stats.map((t) => {
        const pct = Math.round(t.acc * 100);
        return (
          <li key={t.topic}>
            <div className="topic-row">
              <span>{t.topic}</span>
              <span className="topic-right">
                {t.known ? `${t.correct}/${t.total} · ${pct}%` : '—'} <LevelTag level={t.level} known={t.known} />
              </span>
            </div>
            <div className={`bar bar-${t.known ? t.level : 'none'}`} aria-hidden="true">
              <span style={{ width: `${t.known ? pct : 0}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Confirmação de ação destrutiva: diz exatamente o que acontece e só age no botão nomeado. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  /** false = ação comum (botão azul), não destrutiva. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dlg-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="dlg-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel} disabled={busy} autoFocus>Cancelar</button>
        <button className={danger ? "btn btn-danger-solid" : "btn btn-primary"} onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

type IconName = 'target' | 'chart' | 'calendar' | 'trash';
const PATHS: Record<IconName, string> = {
  target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1M21 3l-9 9M16 3h5v5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3M8 17h6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
/** Ícones de traço simples (herdam a cor do texto). */
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
