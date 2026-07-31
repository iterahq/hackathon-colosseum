/**
 * PER-LEARNER, DETERMINISTIC option shuffling.
 *
 * ## Why this module exists
 *
 * The choice/ordering kinds used to shuffle with
 * `seededShuffle(items, Math.random().toString(36))` — a fresh random seed on
 * every MOUNT. That has two costs, and only one of them is about tests:
 *
 *  1. **The order is not stable for a learner.** Remount (a re-render that
 *     drops the component, a reload, coming back to the activity) reshuffled
 *     the screen under the learner's feet. The `seededShuffle` docblock had
 *     always described the intended seed — "userId + activityId" — and nobody
 *     was passing it.
 *  2. **It makes the authored option identity unaddressable.** With a random
 *     permutation and no `data-option-id` in the DOM, the only handle on an
 *     option is its rendered TEXT. Any learning-telemetry event of the shape
 *     "switched from option A to option C" would then be keyed on a label, and
 *     a typo fix in the enunciado would silently break history that, by
 *     definition, cannot be re-collected (plan
 *     `20260731-itera-eventos-aprendizagem`).
 *
 * ## What "deterministic" must NOT mean
 *
 * Shuffling exists for a PEDAGOGICAL reason: two learners side by side must not
 * be able to copy "it's the third one". So the seed is per (learner, activity):
 *
 *   - the SAME learner on the SAME activity always sees the SAME order;
 *   - DIFFERENT learners on the same activity see (with overwhelming
 *     probability) DIFFERENT orders.
 *
 * A seed derived from the activity alone would collapse into "everyone sees the
 * same order", which is the shuffle not existing at all.
 *
 * ## Where the learner half of the seed comes from
 *
 * `currentStorageScope()` — the itera.users id this browser last resolved,
 * persisted in localStorage precisely so it can be read SYNCHRONOUSLY on first
 * paint (see `storageScope.ts`; the shared lab machines at Educar+ are why it
 * exists). When it is not resolvable yet (signed out, guest, or the very first
 * paint before the RPC lands) we fall back to a per-browser random id that is
 * itself persisted, under the same `itera.` prefix — so `clearIteraStorage()`
 * on sign-out / account switch mints a new one and the next learner does not
 * inherit the previous learner's arrangement.
 *
 * ⚠️ Known, accepted wrinkle: on a first-ever visit the identity may resolve
 * mid-session, so the key can change ONCE (anon → itera user id) and an
 * activity mounted before and after that would reshuffle. Everything after that
 * is stable. Reading the id synchronously is what avoids paying that cost on
 * every subsequent visit.
 */
import { seededShuffle } from './seededShuffle';
import { currentStorageScope } from './storageScope';

/** Same `itera.` prefix as the rest of the scoped storage, so sign-out clears it. */
const ANON_SCOPE_KEY = 'itera.shuffle.anon';

/** In-memory fallback for when localStorage is unavailable (SSR, private mode). */
let memoryAnonScope: string | null = null;

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A stable-per-browser id used only when the real learner id is unknown. It is
 * NOT an identity and never leaves the device — its only job is to keep two
 * browsers from agreeing on a permutation.
 */
function anonScope(): string {
  try {
    const stored = localStorage.getItem(ANON_SCOPE_KEY);
    if (stored) return stored;
    const fresh = randomId();
    localStorage.setItem(ANON_SCOPE_KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable: stay stable for the life of the tab at least.
    memoryAnonScope ??= randomId();
    return memoryAnonScope;
  }
}

/** The learner half of the seed. Exported for the determinism tests. */
export function learnerScope(): string {
  return currentStorageScope() ?? anonScope();
}

/**
 * The full seed for one shuffled collection.
 *
 * `salt` separates independent collections inside the SAME activity — `match`
 * shuffles its two columns independently, and without a salt both columns would
 * be driven by the same seed (identical permutation of two different lists is
 * harmless, but the salt keeps the two draws genuinely independent, which is
 * what the "row alignment never leaks the answer" comment claims).
 */
export function learnerShuffleSeed(activityId: string | undefined, salt = ''): string {
  return `${learnerScope()}::${activityId ?? 'unknown-activity'}${salt ? `::${salt}` : ''}`;
}

/** Shuffle `items` deterministically for THIS learner and THIS activity. */
export function learnerShuffle<T>(
  items: readonly T[],
  activityId: string | undefined,
  salt = '',
): T[] {
  return seededShuffle(items, learnerShuffleSeed(activityId, salt));
}

/**
 * Shuffle for the ORDER kind, with one extra guarantee: the arrangement the
 * learner is handed is NEVER already the solution.
 *
 * Without it, a learner could be handed the correct sequence by chance and
 * "score" without composing anything — a 1-in-6 event on a 3-step activity,
 * i.e. routine, not exotic. For any set of ≥2 items another permutation always
 * exists, so this is always satisfiable; a 0- or 1-item list has no other
 * permutation and is returned as-is (there is nothing to get right or wrong).
 *
 * Determinism is preserved: the retry ladder is derived from the same seed.
 */
export function learnerShuffleAvoidingSolution(
  ids: readonly string[],
  activityId: string | undefined,
  solution: readonly string[],
): string[] {
  const isSolution = (candidate: readonly string[]) =>
    candidate.length === solution.length && candidate.every((id, i) => id === solution[i]);

  if (ids.length < 2) return [...ids];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const salt = attempt === 0 ? 'order' : `order#${attempt}`;
    const candidate = seededShuffle(ids, learnerShuffleSeed(activityId, salt));
    if (!isSolution(candidate)) return candidate;
  }

  // Astronomically unlikely to be reached; still, never return the answer key.
  // Swapping the first two elements of a sequence always changes it (n ≥ 2).
  const forced = seededShuffle(ids, learnerShuffleSeed(activityId, 'order'));
  [forced[0], forced[1]] = [forced[1], forced[0]];
  return forced;
}
