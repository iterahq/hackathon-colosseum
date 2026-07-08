import type { ReactNode } from 'react';
import { Link2, Check, Square } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import { LiveRankingCard } from '@/components/live/LiveRankingCard';

interface LiveSidebarProps {
  /** Learner and instructor share this ONE sidebar; the role toggles sections. */
  role: 'learner' | 'instructor';
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  selfUserId?: string;
  /** Instructor only — hidden during reception (no current activity). */
  hasActivity?: boolean;
  activityIndex?: number;
  activityCount?: number;
  kind?: string;
  ranking?: ClassRanking;
  copied?: boolean;
  busy?: boolean;
  onCopyLink?: () => void;
  onEnd?: () => void;
  /** Instructor flow controls, rendered as the top section (no bottom bar). */
  controls?: ReactNode;
}

/**
 * The single right-hand sidebar for the live class — one panel whose stacked
 * SECTIONS are split by hairlines (not floating cards). Both surfaces render the
 * same component; the `role` decides what shows:
 *   - learner: presence + who's-answered (correctness hidden).
 *   - instructor: + activity stats, speed ranking, and the manage actions
 *     (share link / end) at the foot; the activity-specific sections drop out
 *     during reception.
 */
export function LiveSidebar({
  role,
  roster,
  answerers,
  selfUserId,
  hasActivity = true,
  activityIndex = 0,
  activityCount = 0,
  kind = '',
  ranking,
  copied = false,
  busy = false,
  onCopyLink,
  onEnd,
  controls,
}: LiveSidebarProps) {
  const { t } = useI18n();
  const isInstructor = role === 'instructor';
  const showActivity = isInstructor && hasActivity;

  return (
    <aside
      className="w-full lg:w-[340px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col lg:sticky lg:top-0 lg:h-dvh pt-12 lg:pt-14"
      data-testid={isInstructor ? 'instructor-sidebar' : 'live-sidebar'}
    >
      {/* Pinned top: flow controls + activity stats stay put while the
          participant lists below scroll (so navigation never scrolls away). */}
      {isInstructor && (controls || showActivity) && (
        <div className="shrink-0 divide-y divide-border border-b border-border">
          {controls}
          {showActivity && (
            <LiveActivityStatsCard
              bare
              activityIndex={activityIndex}
              activityCount={activityCount}
              kind={kind}
              answerers={answerers}
            />
          )}
        </div>
      )}

      {/* Scrollable middle: this is where scale lives (many learners). */}
      <div className="flex-1 min-h-0 lg:overflow-y-auto divide-y divide-border">
        <LiveRosterCard bare roster={roster} selfUserId={selfUserId} />
        {(!isInstructor || hasActivity) && (
          <LiveAnswerersCard bare answerers={answerers} hideCorrectness={!isInstructor} />
        )}
        {showActivity && ranking && <LiveRankingCard bare ranking={ranking} />}
      </div>

      {isInstructor && (
        <div className="shrink-0 border-t border-border p-5 space-y-2.5">
          <button
            onClick={onCopyLink}
            data-testid="instructor-copy-link"
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-menta/50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-menta" /> {t('live.instructor.copyLinkDone')}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" /> {t('live.instructor.copyLink')}
              </>
            )}
          </button>
          <button
            onClick={onEnd}
            disabled={busy}
            data-testid="instructor-end"
            className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5" /> {t('live.instructor.control.end')}
          </button>
        </div>
      )}
    </aside>
  );
}
