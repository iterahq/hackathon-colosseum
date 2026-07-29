/**
 * Per-learner namespace for everything this app keeps in localStorage.
 *
 * The lab machines at Educar+ are SHARED: the same browser profile carries one
 * class after another. Keys named only after the activity (or the session) were
 * therefore global to the MACHINE, so the next student to open an activity was
 * served the previous student's source — and when the professor pulled them to
 * the stage, the room saw that code under the new student's name.
 *
 * The scope id is itself persisted so it can be read SYNCHRONOUSLY on the first
 * paint after a reload: resolving the Itera user id is an async RPC, and waiting
 * for it would flash the starter over the work we are supposed to be restoring.
 */

const SCOPE_KEY = 'itera.scope.user';
const ITERA_PREFIX = 'itera.';

export function rememberStorageScope(userId: string | null): void {
  if (!userId) return;
  try {
    localStorage.setItem(SCOPE_KEY, userId);
  } catch {
    // Storage unavailable — scoped writes then no-op, which is the safe side.
  }
}

export function currentStorageScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * `null` when the owner is still unknown, and callers MUST then skip the read
 * and the write: falling back to an unscoped key is exactly what leaked.
 */
export function scopedKey(prefix: string, suffix: string): string | null {
  const scope = currentStorageScope();
  return scope ? `${prefix}:${scope}:${suffix}` : null;
}

/**
 * Drop every `itera.` key, the scope pointer included — sign-out and in-tab
 * account switch. Keys written before this fix are unscoped but share the same
 * prefix, so they are collected here too; under the new scheme nothing can read
 * them back anyway, and leaving them on a shared disk buys nothing.
 */
export function clearIteraStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ITERA_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — there is nothing persisted to clear either.
  }
}
