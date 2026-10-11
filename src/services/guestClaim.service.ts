/**
 * A sign-in that comes back from the public first lesson: the passes the visitor settled in this browser are
 * replayed through the normal recorded grading path (the server grades again and writes the completion),
 * then the browser copy is cleared. Whatever did not land is redone in the lesson itself.
 */
import { persistActivityProgress } from '@/services/progress.service';
import { clearGuestAnswers, guestPassesToClaim, readGuestAnswers } from '@/utils/guestLessonStorage';

export async function claimGuestAnswers(onProgress?: (done: number, total: number) => void): Promise<{ attempted: number; landed: number }> {
  const passes = guestPassesToClaim(readGuestAnswers());
  const results: boolean[] = [];
  for (const { activityId, answer } of passes) {
    onProgress?.(results.length, passes.length);
    results.push(
      await persistActivityProgress(activityId, {
        passed: true,
        response: answer.response ?? null,
        duration: null,
        settledAt: answer.settledAt,
        actions: answer.actions,
      })
    );
  }
  clearGuestAnswers();
  return { attempted: passes.length, landed: results.filter(Boolean).length };
}
