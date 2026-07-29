import { LayoutGrid, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveSectionTitle } from '@/components/live/LiveSectionTitle';
import type { ClassAnswerer } from '@/types/liveClass';

interface LiveActivityStatsCardProps {
  answerers: ClassAnswerer[];
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
  /** Short viewport — trade padding for room-list height (see useCompactHeight). */
  compact?: boolean;
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
  answerers,
  bare = false,
  compact = false,
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
        { key: 'answered', icon: <CheckCircle2 className="w-3.5 h-3.5 text-menta" />, tone: 'text-menta', value: answered, label: t('live.stats.responded') },
        { key: 'waiting', icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, tone: 'text-muted-foreground', value: pending, label: t('live.instructor.stats.waiting') },
      ]
    : [
        { key: 'correct', icon: <CheckCircle2 className="w-3.5 h-3.5 text-menta" />, tone: 'text-menta', value: correct, label: t('live.instructor.stats.correct') },
        { key: 'wrong', icon: <XCircle className="w-3.5 h-3.5 text-destructive" />, tone: 'text-destructive', value: wrong, label: t('live.instructor.stats.wrong') },
        { key: 'waiting', icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, tone: 'text-muted-foreground', value: pending, label: t('live.instructor.stats.waiting') },
      ];

  return (
    <div
      className={`${bare ? '' : 'rounded-3xl border border-border bg-card '}${compact ? 'p-3' : 'p-5'}`}
      data-testid="live-activity-stats"
    >
      <LiveSectionTitle icon={LayoutGrid} title={t('live.instructor.stats.title')} compact={compact} />

      <div className={`flex items-center justify-end gap-2 ${compact ? 'mb-2.5' : 'mb-4'}`}>
        <span className="text-xs text-muted-foreground" data-testid="live-stats-answered">
          {t('live.instructor.stats.answered', { answered, total })}
        </span>
      </div>

      {/* Learner view keeps a single "responded" fill: it is the only signal they
          get, and it must never leak the correctness split. */}
      {hideCorrectness && (
        <div
          className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex"
          data-testid="live-stats-bar"
          aria-hidden="true"
        >
          <div className="h-full bg-menta transition-[width] duration-300" style={{ width: `${pct(answered)}%` }} />
        </div>
      )}

      <div className={`flex text-center ${compact ? 'mt-2' : 'mt-3'}`}>
        {stats.map((s, i) => (
          <div
            key={s.key}
            className={`flex-1 flex flex-col items-center gap-1 ${i > 0 ? 'border-l border-border/70' : ''}`}
          >
            <span
              className={`font-mono text-2xl tabular-nums leading-none ${
                s.value === 0 ? 'text-muted-foreground/50' : s.tone
              }`}
            >
              {s.value}
            </span>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.icon}
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
