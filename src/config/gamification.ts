/**
 * Gamification config constants.
 *
 * XP_PER_ACTIVITY — XP awarded once per activity on the first completion.
 * Configurable via VITE_ITERA_XP_PER_ACTIVITY (build-time env); defaults to 10.
 * Kept here (not inlined) so it's importable + unit-testable, and so the value
 * has a single source of truth shared by the player and any future surface.
 *
 * The award itself is idempotent server-side (itera.award_activity_xp RPC,
 * migration 0008): re-completing an activity does NOT grant XP twice.
 */

const DEFAULT_XP_PER_ACTIVITY = 10;

/** Parse a positive integer env var, falling back to `fallback` when unset/invalid. */
export function parseXpPerActivity(
  raw: string | undefined,
  fallback = DEFAULT_XP_PER_ACTIVITY
): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const XP_PER_ACTIVITY = parseXpPerActivity(
  import.meta.env.VITE_ITERA_XP_PER_ACTIVITY as string | undefined
);
