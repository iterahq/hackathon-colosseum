/**
 * What the lesson player knows about answered exercises when it opens: this
 * device's own record (`lessonAnswerStorage`) reconciled with the attempt log.
 * Pure, so the rules are testable without a DOM or a database.
 */
import type { LatestAttempts, ProgressStatus } from '@/services/progress.service';
import type { StoredLessonAnswer } from '@/types/lessonAnswer';

/**
 * The two clocks differ: a local answer is stamped by the browser when it
 * settles, the log by the database when the row lands. A logged attempt only
 * supersedes the local one when it is clearly a LATER attempt.
 */
export const NEWER_ATTEMPT_SLACK_MS = 60_000;

/**
 * The exercises the attempt log says are answered.
 *
 * - `completed` → the newest PASS.
 * - not completed, newest attempt a MISS → that miss.
 * - not completed, newest attempt a PASS → nothing: a lesson reset re-opened it
 *   (`reopenLessonProgress` demotes `completed` and leaves the log intact).
 */
export function answersFromLog(
  activityIds: readonly string[],
  statuses: Readonly<Record<string, ProgressStatus>>,
  attempts: Readonly<Record<string, LatestAttempts>>
): Record<string, StoredLessonAnswer> {
  const answers: Record<string, StoredLessonAnswer> = {};
  for (const id of activityIds) {
    const logged = attempts[id];
    if (!logged) continue;
    const attempt = statuses[id] === 'completed' ? logged.latestPass : logged.latest;
    if (!attempt || (statuses[id] !== 'completed' && attempt.passed)) continue;
    answers[id] = {
      correct: attempt.passed,
      settledAt: attempt.settledAt,
      saved: true,
      response: attempt.response,
    };
  }
  return answers;
}

/**
 * Reconcile this device's answers with the log's.
 *
 * - A saved local PASS the server no longer holds as `completed` is dropped:
 *   the lesson was reset from another device, and keeping it would lock the
 *   exercise as "done" where it can never be completed again.
 * - A logged attempt clearly newer than the local one wins (answered again
 *   elsewhere).
 * - Otherwise the local answer stays — it is the one carrying the actions.
 *
 * Returns the merged map and the ids whose answer came from the log, which
 * still need their action sequence read back.
 */
export function reconcileAnswers(
  activityIds: readonly string[],
  local: Readonly<Record<string, StoredLessonAnswer>>,
  statuses: Readonly<Record<string, ProgressStatus>>,
  attempts: Readonly<Record<string, LatestAttempts>>
): { answers: Record<string, StoredLessonAnswer>; fromLog: string[] } {
  const logged = answersFromLog(activityIds, statuses, attempts);
  const answers: Record<string, StoredLessonAnswer> = {};
  const fromLog: string[] = [];
  for (const id of activityIds) {
    const mine = local[id];
    const theirs = logged[id];
    if (mine && mine.correct && mine.saved && statuses[id] !== 'completed') {
      if (theirs) {
        answers[id] = theirs;
        fromLog.push(id);
      }
      continue;
    }
    if (theirs && (!mine || theirs.settledAt - mine.settledAt > NEWER_ATTEMPT_SLACK_MS)) {
      // A replayed attempt lands late and carries no trace: when the outcome is
      // the same, the picks this device recorded are still the ones to draw.
      const samePicks = mine?.correct === theirs.correct ? mine.actions : undefined;
      answers[id] = samePicks?.length ? { ...theirs, actions: samePicks } : theirs;
      fromLog.push(id);
      continue;
    }
    if (mine) answers[id] = mine;
  }
  return { answers, fromLog };
}

/**
 * How far before a local answer's own timestamp a logged row may sit and still
 * be THAT answer. Kept small on purpose: mistaking an earlier attempt for this
 * one loses an attempt for good, while replaying one that had landed only
 * double-counts it.
 */
export const LANDED_ATTEMPT_SLACK_MS = 5_000;

/**
 * Whether a local answer whose write was never confirmed still has to be sent.
 * The tab can close between the row landing and the `saved` flag being set; the
 * attempt log is what tells the two apart.
 */
export function needsReplay(
  answer: StoredLessonAnswer,
  status: ProgressStatus | undefined,
  logged: LatestAttempts | undefined
): boolean {
  if (answer.saved || status === 'completed') return false;
  // Only a logged attempt with the SAME outcome can be this answer: an earlier
  // miss sitting in the log must not pass for a pass that never landed.
  const same = answer.correct ? logged?.latestPass : logged?.latest;
  if (!same || same.passed !== answer.correct) return true;
  return same.settledAt < answer.settledAt - LANDED_ATTEMPT_SLACK_MS;
}

/**
 * The furthest activity the learner has reached: where the lesson resumes, or
 * past the last answered one when a retry re-opened something earlier.
 */
export function furthestReached(
  activityIds: readonly string[],
  resumeAt: number,
  answered: ReadonlySet<string>
): number {
  let last = -1;
  activityIds.forEach((id, i) => {
    if (answered.has(id)) last = i;
  });
  return Math.max(0, Math.min(activityIds.length - 1, Math.max(resumeAt, last + 1)));
}
