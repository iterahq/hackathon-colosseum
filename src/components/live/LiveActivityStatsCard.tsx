import { LayoutGrid, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { activityKindLabelKey } from '@/utils/activityKindLabel';
import type { ClassAnswerer } from '@/types/liveClass';

interface LiveActivityStatsCardProps {
  /** The current activity kind (e.g. `single_choice`) — the "which slide" cue. */
  kind: string;
  answerers: ClassAnswerer[];
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
  /**
   * Learner view: collapse the correct/wrong split into a single "responded"
   * bucket (aula1 Opção A — a learner never sees who got it right or wrong).
   */
  hideCorrectness?: boolean;
}

/**
 * At-a-glance panel: which activity is on screen (N/M + kind) and how the room
 * is answering right now. The instructor sees the full correct / wrong /
 * still-thinking distribution (the "run the room" surface); the learner gets the
 * same participation pulse with `hideCorrectness` — responded / waiting only,
 * never the correctness split.
 */
export function LiveActivityStatsCard({
  kind,
  answerers,
  bare = false,
  hideCorrectness = false,
}: LiveActivityStatsCardProps) {
  const { t } = useI18n();

  const total = answerers.length;
  const correct = answerers.filter((a) => a.state === 'done').length;
  const wrong = answerers.filter((a) => a.state === 'wrong').length;
  const pending = answerers.filter((a) => a.state === 'pending').length;
  const answered = correct + wrong;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const stats = hideCorrectness
    ? [
        { key: 'answered', icon: <CheckCircle2 className="w-3.5 h-3.5 text-menta" />, value: answered, label: t('live.stats.responded') },
        { key: 'waiting', icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, value: pending, label: t('live.instructor.stats.waiting') },
      ]
    : [
        { key: 'correct', icon: <CheckCircle2 className="w-3.5 h-3.5 text-menta" />, value: correct, label: t('live.instructor.stats.correct') },
        { key: 'wrong', icon: <XCircle className="w-3.5 h-3.5 text-destructive" />, value: wrong, label: t('live.instructor.stats.wrong') },
        { key: 'waiting', icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, value: pending, label: t('live.instructor.stats.waiting') },
      ];

  return (
    <div className={bare ? 'p-5' : 'rounded-3xl border border-clay/40 bg-card p-5'} data-testid="live-activity-stats">
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid className="w-4 h-4 text-clay" />
        <h3 className="font-display text-foreground text-sm">{t('live.instructor.stats.title')}</h3>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="inline-flex items-center px-2 h-6 rounded-full border border-border bg-background text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t(activityKindLabelKey(kind))}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="live-stats-answered">
          {t('live.instructor.stats.answered', { answered, total })}
        </span>
      </div>

      {/* Distribution bar — instructor: correct / wrong split; learner: a single
          "responded" fill so it never leaks correctness. */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex" aria-hidden="true">
        {hideCorrectness ? (
          <div className="h-full bg-menta transition-[width] duration-300" style={{ width: `${pct(answered)}%` }} />
        ) : (
          <>
            <div className="h-full bg-menta transition-[width] duration-300" style={{ width: `${pct(correct)}%` }} />
            <div className="h-full bg-destructive transition-[width] duration-300" style={{ width: `${pct(wrong)}%` }} />
          </>
        )}
      </div>

      <div className={`mt-3 grid gap-2 text-center ${hideCorrectness ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
