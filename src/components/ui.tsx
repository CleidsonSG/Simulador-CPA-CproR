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
