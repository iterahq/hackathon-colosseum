import type { ReactNode } from 'react';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { LiveActivityStepper } from '@/components/live/LiveActivityStepper';
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
  answerers,
  compact,
  controls,
}: {
  showActivity: boolean;
  activityIndex: number;
  activityCount: number;
  answerers: ClassAnswerer[];
  compact: boolean;
  controls?: ReactNode;
}) {
  return (
    <div className="shrink-0 max-h-[52dvh] overflow-y-auto divide-y divide-border border-b border-border">
      <div>
        {showActivity && activityCount > 0 && (
          <LiveActivityStepper index={activityIndex} count={activityCount} />
        )}
        {controls}
      </div>
      {showActivity && (
        <LiveActivityStatsCard bare compact={compact} answerers={answerers} />
      )}
    </div>
  );
}
