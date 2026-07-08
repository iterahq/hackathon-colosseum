import { LayoutGrid, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassAnswerer } from '@/types/liveClass';

interface LiveActivityStatsCardProps {
  activityIndex: number;
  activityCount: number;
  /** The current activity kind (e.g. `single_choice`) — the "which slide" cue. */
  kind: string;
  answerers: ClassAnswerer[];
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
}

/**
 * Instructor-only at-a-glance panel: which activity is on screen (N/M + kind)
 * and how the room is answering right now — correct / wrong / still-thinking,
 * with a live distribution bar. The learner never sees this; it's the "run the
 * room" surface the professor drives from (the Open English reference).
 */
export function LiveActivityStatsCard({
  activityIndex,
  activityCount,
  kind,
  answerers,
  bare = false,
}: LiveActivityStatsCardProps) {
  const { t } = useI18n();

  const total = answerers.length;
  const correct = answerers.filter((a) => a.state === 'done').length;
  const wrong = answerers.filter((a) => a.state === 'wrong').length;
  const pending = answerers.filter((a) => a.state === 'pending').length;
  const answered = correct + wrong;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const stats = [
    { key: 'correct', icon: <CheckCircle2 className="w-3.5 h-3.5 text-menta" />, value: correct, label: t('live.instructor.stats.correct') },
    { key: 'wrong', icon: <XCircle className="w-3.5 h-3.5 text-clay" />, value: wrong, label: t('live.instructor.stats.wrong') },
    { key: 'waiting', icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, value: pending, label: t('live.instructor.stats.waiting') },
  ];

  return (
    <div className={bare ? 'p-5' : 'rounded-3xl border border-clay/40 bg-card p-5'} data-testid="live-activity-stats">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-clay" />
          <h3 className="font-display text-foreground text-sm">{t('live.instructor.stats.title')}</h3>
        </div>
        <span className="font-mono text-sm tabular-nums text-clay" data-testid="live-stats-position">
          {activityIndex + 1}/{activityCount}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="inline-flex items-center px-2 h-6 rounded-full border border-border bg-background text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {kind.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="live-stats-answered">
          {t('live.instructor.stats.answered', { answered, total })}
        </span>
      </div>

      {/* Live distribution bar — correct / wrong / still-thinking. */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex" aria-hidden="true">
        <div className="h-full bg-menta transition-[width] duration-300" style={{ width: `${pct(correct)}%` }} />
        <div className="h-full bg-clay transition-[width] duration-300" style={{ width: `${pct(wrong)}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.key} className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              {s.icon}
              <span className="font-mono text-base tabular-nums text-foreground leading-none">{s.value}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
