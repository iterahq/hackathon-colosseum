/**
 * The Itera Player's ADAPTER over the package's per-learner shuffle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MOVED AND WHAT DID NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * The shuffle itself is pure and lives in `@iterahq/activities` (Fase C,
 * step 1). What could NOT move is the line that made it work here:
 * `currentStorageScope()` — the Itera user id this browser last resolved,
 * persisted in localStorage under the `itera.` prefix so it can be read
 * SYNCHRONOUSLY on first paint (see `storageScope.ts`; the shared lab machines
 * at Educar+ are why it exists).
 *
 * That is HOST SESSION STATE. A library that read it would either find nothing
 * in another app — handing every learner there the SAME permutation, i.e. the
 * shuffle silently not existing — or, worse, agree with an unrelated app that
 * happens to use the same key. So the package takes the learner scope as an
 * argument, and this file is the one place that supplies the Itera answer.
 *
 * Behaviour is UNCHANGED: `learnerScope()` still resolves exactly as before,
 * and the anonymous fallback still uses the same `itera.shuffle.anon` key, so
 * a learner's existing arrangement survives this refactor.
 *
 * ⚠️ The extracted kinds do NOT come through here — they read the scope from
 * `identity.userId` on the activity host context, which `ActivityRenderer.tsx`
 * fills with this same `currentStorageScope()`. This module remains for the
 * app-side callers and for `learnerShuffle.test.ts`.
 */
import {
  anonLearnerScope,
  learnerShuffle as shuffleWithScope,
  learnerShuffleAvoidingSolution as shuffleAvoidingSolutionWithScope,
  learnerShuffleSeed as shuffleSeed,
} from '@iterahq/activities';
import { currentStorageScope } from './storageScope';

/** The learner half of the seed. Exported for the determinism tests. */
export function learnerScope(): string {
  return currentStorageScope() ?? anonLearnerScope();
}

/** The full seed for one shuffled collection. */
export function learnerShuffleSeed(activityId: string | undefined, salt = ''): string {
  return shuffleSeed(learnerScope(), activityId, salt);
}

/** Shuffle `items` deterministically for THIS learner and THIS activity. */
export function learnerShuffle<T>(
  items: readonly T[],
  activityId: string | undefined,
  salt = '',
): T[] {
  return shuffleWithScope(items, learnerScope(), activityId, salt);
}

/**
 * Shuffle for the ORDER kind, with the extra guarantee that the arrangement the
 * learner is handed is NEVER already the solution.
 */
export function learnerShuffleAvoidingSolution(
  ids: readonly string[],
  activityId: string | undefined,
  solution: readonly string[],
): string[] {
  return shuffleAvoidingSolutionWithScope(ids, learnerScope(), activityId, solution);
}
