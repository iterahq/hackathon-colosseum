import type { ReactNode } from 'react';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import type { ClassAnswerer } from '@/types/liveClass';

/**
 * The instructor's top block: where the class is (N/M), the flow controls and
 * how the room is answering.
 *
 * The height cap matters more than it looks: flow + stats are static, the room
 * list is the only live region of the panel. Without a ceiling a long control
 * stack pushes the list — the thing the professor actually watches — off screen.
 */
export function LiveSidebarFlow({
  showActivity,
  activityIndex,
  activityCount,
  kind,
  answerers,
  compact,
  controls,
}: {
  showActivity: boolean;
  activityIndex: number;
  activityCount: number;
  kind: string;
  answerers: ClassAnswerer[];
  compact: boolean;
  controls?: ReactNode;
}) {
  return (
    <div className="shrink-0 max-h-[52vh] overflow-y-auto divide-y divide-border border-b border-border">
      {showActivity && activityCount > 0 && (
        <div className="py-2.5 flex justify-center">
          <span className="font-mono text-sm tabular-nums text-clay" data-testid="live-position">
            {activityIndex + 1}/{activityCount}
          </span>
        </div>
      )}
      {controls}
      {showActivity && (
        <LiveActivityStatsCard bare compact={compact} kind={kind} answerers={answerers} />
      )}
    </div>
  );
}
