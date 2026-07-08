import { Link2, Check, Square } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import { LiveRankingCard } from '@/components/live/LiveRankingCard';

interface InstructorSidebarProps {
  /** False during reception — the activity-specific sections are hidden. */
  hasActivity: boolean;
  activityIndex: number;
  activityCount: number;
  kind: string;
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  ranking: ClassRanking;
  selfUserId?: string;
  copied: boolean;
  busy: boolean;
  onCopyLink: () => void;
  onEnd: () => void;
}

/**
 * The professor's single right-hand sidebar — one panel whose stacked SECTIONS
 * (activity stats, presence, who's done, speed ranking) are split by hairlines
 * instead of floating cards. The class-management actions (share link, end)
 * live at the foot of it, out of the presenter bar (per Tainan).
 */
export function InstructorSidebar({
  hasActivity,
  activityIndex,
  activityCount,
  kind,
  roster,
  answerers,
  ranking,
  selfUserId,
  copied,
  busy,
  onCopyLink,
  onEnd,
}: InstructorSidebarProps) {
  const { t } = useI18n();
  return (
    <LiveSidebar testid="instructor-sidebar">
      {hasActivity && (
        <LiveActivityStatsCard
          bare
          activityIndex={activityIndex}
          activityCount={activityCount}
          kind={kind}
          answerers={answerers}
        />
      )}
      <LiveRosterCard bare roster={roster} selfUserId={selfUserId} />
      {hasActivity && <LiveAnswerersCard bare answerers={answerers} />}
      {hasActivity && <LiveRankingCard bare ranking={ranking} />}

      <div className="p-5 space-y-2.5">
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
    </LiveSidebar>
  );
}
