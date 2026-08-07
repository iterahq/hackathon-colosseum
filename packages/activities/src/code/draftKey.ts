/**
 * The storage key the `code` kind reads and writes the learner's draft under.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE KEY IS PART OF THE PUBLIC SURFACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ActivityStoragePort` is `(key) => string | null` — the package names the
 * slot, the host decides where it lives. That works only if the host can tell
 * WHICH slot it was handed: the Itera Player's adapter has to route this key to
 * `codeSnapshot.service`, which namespaces per learner (`scopedKey`), wraps the
 * source in a `{ code, savedAt }` envelope and fires the DOM event the live
 * class listens to for "this learner has work in progress". None of that can be
 * inferred from an opaque string.
 *
 * So the prefix is exported and documented, and an adapter is three lines:
 *
 *   read:  (key) => readCodeSnapshot(idOf(key))?.code ?? null
 *   write: (key, value) => saveCodeSnapshot(idOf(key), value)
 *   clear: (key) => clearCodeSnapshot(idOf(key))
 *
 * ⚠️ The prefix VALUE is deliberately the one the Player already used
 * (`itera.code.snapshot:`), so a host that ignores the port and lets the
 * package's own localStorage default run lands on a key that does not collide
 * with the Player's scoped one (`itera.code.snapshot:<learner>:<activity>`) but
 * is recognisably the same family. `src/test/codeDraftKeyCompat.test.tsx`
 * pins the Player's on-disk key against this, because a learner mid-lesson must
 * not lose their work to a rename.
 */

/** Prefix of every draft key the `code` kind hands to `ActivityStoragePort`. */
export const CODE_DRAFT_KEY_PREFIX = 'itera.code.snapshot:';

/** The storage key for one activity's draft. */
export function codeDraftKey(activityId: string): string {
  return `${CODE_DRAFT_KEY_PREFIX}${activityId}`;
}

/**
 * The inverse, for a host adapter that needs the activity id back.
 * Returns `''` for a key this package did not mint — a host should treat that
 * as "not mine" rather than as an activity called empty-string.
 */
export function codeDraftActivityId(key: string): string {
  return key.startsWith(CODE_DRAFT_KEY_PREFIX) ? key.slice(CODE_DRAFT_KEY_PREFIX.length) : '';
}
