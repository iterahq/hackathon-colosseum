/**
 * Gathers the content a learner replies with when the instructor pulls their
 * work to the class stage (`stage-answer`). All data is read from the learner's
 * OWN local state — no DB, no migration (the class is synchronous, the student is
 * online): a saved code-snack source (`readCodeSnapshot`) wins and is staged as
 * `code`; otherwise a best-effort correct/wrong summary from `readStoredAnswer`.
 *
 * ADR-4 (revised 2026-07-23): the professor pulls WORK IN PROGRESS too, not only
 * finished answers — following how the class is advancing is the whole point. So
 * this NEVER returns null anymore. It always returns a `status` describing where
 * the learner is, so the pull never fails in silence (which looked to the
 * professor like a broken button). `not_started` is a statement about THIS
 * signal, not about the learner: only a code snapshot or a submitted answer is
 * visible here, so a learner mid-way through any other kind reports it too —
 * which is why the stage projects the current activity instead of announcing it.
 */
import { readCodeSnapshot } from '@/services/codeSnapshot.service';
import { readStoredAnswer } from '@/utils/liveAnswerStorage';
import type { StageContent, StageWorkStatus } from '@/types/liveClass';

export type { StageContent, StageWorkStatus } from '@/types/liveClass';

const STATUSES: StageWorkStatus[] = ['submitted', 'in_progress', 'not_started'];

/**
 * Reads a `status` off a channel payload. Defaults to `submitted` because a
 * client running the PREVIOUS build omits the field and only ever replied when it
 * had a finished answer — a mid-class deploy must not mislabel those as drafts.
 */
export function parseStageStatus(value: unknown): StageWorkStatus {
  return STATUSES.includes(value as StageWorkStatus) ? (value as StageWorkStatus) : 'submitted';
}

export function gatherStageContent(sessionId: string, activityId: string): StageContent {
  const submitted = readStoredAnswer(sessionId, activityId);
  const snapshot = readCodeSnapshot(activityId);
  // The code snack autosaves every 600ms, so a snapshot exists long before the
  // learner clicks Done — that draft IS the interesting artifact to project.
  if (snapshot) {
    return {
      kind: 'code',
      content: snapshot.code,
      status: submitted ? 'submitted' : 'in_progress',
    };
  }
  if (submitted) {
    return {
      kind: 'answer',
      content: submitted.correct ? 'correct' : 'wrong',
      status: 'submitted',
    };
  }
  // Nothing local at all — the learner is in the room but hasn't touched this
  // activity yet. Explicit empty state (not null) so the pull still resolves.
  return { kind: 'empty', content: '', status: 'not_started' };
}
