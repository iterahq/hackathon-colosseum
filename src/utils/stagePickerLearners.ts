/**
 * Builds the instructor's stage-picker list: EVERY learner present in the room
 * (ADR-4 revised — the professor follows work in progress, not just finished
 * answers), each tagged with the state we can actually observe:
 *
 *   submitted   — the learner broadcast an `answered` event for this activity.
 *   in_progress — presence says they already have local work for it (`workingOn`).
 *   not_started — present, but no signal of work yet.
 *
 * `workingOn` is best-effort: a learner on the previous build never tracks it, so
 * they read as `not_started` until they submit. That degrades to the OLD
 * behaviour's information, never to something wrong — and the pull itself always
 * returns the learner's real state (utils/stageAnswerContent).
 *
 * Padrão do projeto: pure function, no React.
 */
import type { ClassPresenceMember, StagePickerLearner, StageWorkStatus } from '@/types/liveClass';

export function buildStagePickerLearners(
  roster: ClassPresenceMember[],
  currentActivityId: string | null,
  answeredByUserId: Record<string, boolean> | undefined
): StagePickerLearner[] {
  return roster
    .filter((m) => !m.isInstructor)
    .map((m) => {
      let state: StageWorkStatus = 'not_started';
      if (answeredByUserId && answeredByUserId[m.userId] !== undefined) state = 'submitted';
      else if (currentActivityId && m.workingOn === currentActivityId) state = 'in_progress';
      return { userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, state };
    });
}
