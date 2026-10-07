/**
 * Where a lesson opens for a returning learner, and what it already knows about
 * each exercise: the server's progress and attempt log reconciled with this
 * device's own record. The IO half of `utils/lessonAnswerResume.ts`, lifted out
 * of `LessonPlayer` so the page only applies the result.
 */
import {
  fetchActivityProgressOrNull,
  fetchAnswerActions,
  fetchLatestAttempts,
  resumeIndexFor,
} from '@/services/progress.service';
import { writeOrQueue } from '@/hooks/useAnswerOutbox';
import {
  clearLessonAnswers,
  confirmLessonAnswer,
  readLessonAnswers,
  storeLessonAnswer,
  type StoredLessonAnswer,
} from '@/utils/lessonAnswerStorage';
import { furthestReached, needsReplay, reconcileAnswers } from '@/utils/lessonAnswerResume';
import { RESTORES_FROM_ACTIONS } from '@/utils/answerRestore';
import type { Activity } from '@/types/content';

/** How long the resume waits for the picked options of answers made on another device. */
export const ANSWER_ACTIONS_TIMEOUT_MS = 2500;

export interface LessonResume {
  /** Activities the server holds as completed. */
  doneIds: Set<string>;
  /** What the learner answered, hit or miss, keyed by activity. */
  answers: Record<string, StoredLessonAnswer>;
  /** The activity to show. */
  index: number;
  /** The furthest activity already reached. */
  furthest: number;
  /** Every activity is DONE: open on the completion screen. */
  completed: boolean;
  /** Every activity is answered, hit or miss: the end of the lesson has been reached. */
  finished: boolean;
}

/**
 * Best-effort by design: a failed read degrades to this device's record, and
 * with none to the top of the lesson. Resolves to `null` when `isCancelled`
 * turns true mid-way — nothing is written to storage after that point.
 */
export async function resumeLesson(
  activities: readonly Activity[],
  isCancelled: () => boolean
): Promise<LessonResume | null> {
  const ids = activities.map((a) => a.id);
  // The attempt log rides along with progress: it is what makes an answered
  // exercise re-open answered on a device that never saw the answer.
  const [progress, log] = await Promise.all([
    fetchActivityProgressOrNull(ids),
    fetchLatestAttempts(ids),
  ]);
  if (isCancelled()) return null;
  const statuses = progress ?? {};
  // The log only overrides this device's record when BOTH reads landed: a
  // failed progress read looks like "nothing completed", and reconciling
  // against that would drop every pass kept here.
  const attempts = progress ? log : null;
  const done = ids.filter((id) => statuses[id] === 'completed');
  const stored = readLessonAnswers();
  const local: Record<string, StoredLessonAnswer> = {};
  for (const id of ids) {
    const answer = stored[id];
    if (!answer) continue;
    local[id] = answer;
    // The tab closed with this attempt still in flight. Replay it through
    // the durable outbox, dated to when the learner actually answered.
    if (needsReplay(answer, statuses[id], attempts?.[id])) {
      void writeOrQueue({
        kind: 'progress',
        activityId: id,
        passed: answer.correct,
        response: answer.response ?? null,
        duration: null,
        settledAt: answer.settledAt,
      }).then((landed) => {
        // A queued PASS stays unconfirmed: confirmed without `completed`, the
        // next load would read it as re-opened and drop it.
        if (landed || !answer.correct) confirmLessonAnswer(id, answer.settledAt);
      });
    } else if (!answer.saved && attempts) {
      // Its row had landed; only the confirmation was lost with the tab.
      local[id] = { ...answer, saved: true };
      storeLessonAnswer(id, local[id]);
    }
  }
  // A failed read (`null`) leaves this device's own record as it is.
  let known = local;
  if (attempts) {
    const { answers: reconciled, fromLog } = reconcileAnswers(ids, local, statuses, attempts);
    const kindOf = new Map(activities.map((a) => [a.id, a.kind as string]));
    await Promise.all(
      fromLog
        .filter((id) => RESTORES_FROM_ACTIONS.has(kindOf.get(id) ?? ''))
        .map(async (id) => {
          // Drawing the picked option is a nicety: it never holds the lesson.
          const actions = await Promise.race([
            fetchAnswerActions(id, reconciled[id].settledAt, reconciled[id].correct),
            new Promise<[]>((resolve) => setTimeout(() => resolve([]), ANSWER_ACTIONS_TIMEOUT_MS)),
          ]);
          if (actions.length > 0) reconciled[id] = { ...reconciled[id], actions };
        })
    );
    if (isCancelled()) return null;
    clearLessonAnswers(ids.filter((id) => local[id] && !reconciled[id]));
    for (const id of fromLog) storeLessonAnswer(id, reconciled[id]);
    known = reconciled;
  }
  const answered = new Set([...done, ...Object.keys(known)]);
  const resumeAt = resumeIndexFor(ids, statuses, answered);
  const last = Math.max(0, ids.length - 1);
  const finished = resumeAt >= ids.length;
  // Answered is not done: a miss is answered. A learner coming back to a
  // lesson whose only open work is what they missed lands ON the first miss,
  // not on a completion screen for a lesson that is not complete.
  const firstPending = ids.findIndex((id) => statuses[id] !== 'completed');
  const completed = finished && firstPending === -1;
  return {
    doneIds: new Set(done),
    answers: known,
    index: completed ? last : finished ? firstPending : resumeAt,
    furthest: finished ? last : furthestReached(ids, resumeAt, answered),
    completed,
    finished,
  };
}
