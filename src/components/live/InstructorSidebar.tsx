import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import { LiveRankingCard } from '@/components/live/LiveRankingCard';

interface InstructorSidebarProps {
  activityIndex: number;
  activityCount: number;
  kind: string;
  roster: ClassPresenceMember[];
  answerers: ClassAnswerer[];
  ranking: ClassRanking;
  selfUserId?: string;
}

/**
 * The professor's single right-hand sidebar — a real panel (border-left, one
 * surface) whose stacked SECTIONS (activity stats, presence, who's done, speed
 * ranking) are divided by hairlines instead of floating as separate cards. Left
 * of it the activity stays centered in the remaining space, learner-identical.
 */
export function InstructorSidebar({
  activityIndex,
  activityCount,
  kind,
  roster,
  answerers,
  ranking,
  selfUserId,
}: InstructorSidebarProps) {
  return (
    <aside
      className="w-full lg:w-[340px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto divide-y divide-border pt-12 lg:pt-14 pb-24"
      data-testid="instructor-sidebar"
    >
      <LiveActivityStatsCard
        bare
        activityIndex={activityIndex}
        activityCount={activityCount}
        kind={kind}
        answerers={answerers}
      />
      <LiveRosterCard bare roster={roster} selfUserId={selfUserId} />
      <LiveAnswerersCard bare answerers={answerers} />
      <LiveRankingCard bare ranking={ranking} />
    </aside>
  );
}
