/**
 * Gathers the content a learner replies with when the instructor pulls their
 * answer to the class stage (`stage-answer`). All data is read from the learner's
 * OWN local state — no DB, no migration (the class is synchronous, the student is
 * online): a saved code-snack source (`readCodeSnapshot`) wins and is staged as
 * `code`; otherwise a best-effort correct/wrong summary from `readStoredAnswer`.
 *
 * Returns null when the learner has no answer for the activity — so a student who
 * hasn't answered never responds to a `stage-request`.
 */
import { readCodeSnapshot } from '@/services/codeSnapshot.service';
import { readStoredAnswer } from '@/utils/liveAnswerStorage';

export function gatherStageContent(
  sessionId: string,
  activityId: string
): { kind: string; content: string } | null {
  const snapshot = readCodeSnapshot(activityId);
  if (snapshot) return { kind: 'code', content: snapshot.code };
  const stored = readStoredAnswer(sessionId, activityId);
  if (!stored) return null;
  return { kind: 'answer', content: stored.correct ? 'correct' : 'wrong' };
}
