import type { LiveRoomModeration, LiveRoomRow, LiveRoomRowActions, StagedAuthor } from '@/types/liveClass';

/**
 * Builds the per-row action set of the live sidebar. Returns undefined when the
 * caller is not the professor (no moderation handlers), which is what keeps the
 * rows inert for learners.
 */
export function roomActionsFactory(input: {
  moderation?: LiveRoomModeration;
  onToggleStage?: (userId: string) => void;
  stagedAuthor?: StagedAuthor | null;
  stagePendingUserId?: string | null;
  stageUnreachableUserId?: string | null;
}): ((row: LiveRoomRow) => LiveRoomRowActions) | undefined {
  const { moderation, onToggleStage } = input;
  if (!moderation || !onToggleStage) return undefined;
  return (row) => ({
    ...moderation,
    onToggleStage,
    onStage: input.stagedAuthor?.userId === row.userId,
    pending: input.stagePendingUserId === row.userId,
    unreachable: input.stageUnreachableUserId === row.userId,
  });
}
