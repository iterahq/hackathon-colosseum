/**
 * A sign-in that comes back from the public first lesson: the passes the visitor settled in this browser are
 * sent in ONE request to the recorded grading path (the server grades each again and writes the completion at
 * the time it first graded it), then the browser copy is cleared. Whatever did not land is redone in the lesson.
 */
import { claimGuestPasses } from '@/services/grade.service';
import { clearGuestAnswers, guestPassesToClaim, readGuestAnswers } from '@/utils/guestLessonStorage';

export async function claimGuestAnswers(): Promise<{ attempted: number; landed: number }> {
  const passes = guestPassesToClaim(readGuestAnswers());
  if (passes.length === 0) return { attempted: 0, landed: 0 };
  const landed = await claimGuestPasses(
    passes.map(({ activityId, answer }) => ({
      activityId,
      response: answer.response ?? null,
      actions: answer.actions,
      receipt: answer.receipt,
      settledAt: answer.settledAt,
    })),
  );
  // A request that never reached the server keeps the browser copy: the next visit to /try claims again.
  if (landed === null) return { attempted: passes.length, landed: 0 };
  clearGuestAnswers();
  return { attempted: passes.length, landed: landed.size };
}
