import { byocSpecFromRaw } from './byocSpec';
import { isAnswerableLiveKind } from './isAnswerableLiveKind';

/**
 * How long the shared live-class countdown runs for a given activity.
 *
 * Before this util the instructor surface used ONE constant (60s) for every
 * answerable kind. That is fine for a multiple-choice round, but it is far too
 * short for a `code` activity — writing something like a `useState` hook from
 * scratch takes a beginner 5–8 minutes, so a 1:00 countdown expires on the most
 * important exercise of the class (the learner gate then LOCKS the activity,
 * see `learnerActivityGate`). Hence a per-kind default, plus an optional
 * per-activity override.
 *
 * Resolution order:
 *   1. non-answerable kind (concept/video/document/diagram) → `0` = no timer
 *      (the countdown is part of the answer flow: expiry locks answering) —
 *      UNLESS a BYOC harness rides on the spec, which makes any kind answerable
 *   2. a valid `spec.timer_seconds` on the activity → that value
 *   3. a BYOC harness → `LIVE_TIMER_BYOC_SECONDS`
 *   4. the per-kind default (`LIVE_TIMER_DEFAULTS_BY_KIND`)
 *   5. `LIVE_TIMER_FALLBACK_SECONDS` (60s — the pre-existing behaviour)
 */

/** Per-kind defaults. Kinds absent here fall back to 60s (unchanged behaviour). */
export const LIVE_TIMER_DEFAULTS_BY_KIND: Readonly<Record<string, number>> = {
  // Writing code from scratch is a 5–8 min task for a beginner cohort.
  code: 300,
};

/**
 * BYOC spends the first part of the round GENERATING — measured at 26–58s in
 * production on the free tier, with a 90s server timeout — before the learner
 * even sees a question. Under the 60s default the whole cohort would be locked
 * out by `learnerActivityGate` while still waiting on the model, so BYOC gets
 * the worst-case generation plus room to actually read and answer.
 */
export const LIVE_TIMER_BYOC_SECONDS = 180;

/** Default for every answerable kind without an entry above (legacy value). */
export const LIVE_TIMER_FALLBACK_SECONDS = 60;

/** Accepted range for a `spec.timer_seconds` override (1s … 1h). */
export const LIVE_TIMER_MIN_SECONDS = 1;
export const LIVE_TIMER_MAX_SECONDS = 3600;

/**
 * The per-kind default (no override applied). `0` for content kinds — those
 * have nothing to answer, so they get no countdown at all.
 *
 * `spec` is consulted only for the BYOC layer, which is authored on the spec
 * rather than on the kind and turns even a `concept` into a graded round.
 */
export function liveTimerDefaultSeconds(kind: string | null | undefined, spec?: unknown): number {
  if (byocSpecFromRaw(spec)) return LIVE_TIMER_BYOC_SECONDS;
  if (!isAnswerableLiveKind(kind)) return 0;
  return LIVE_TIMER_DEFAULTS_BY_KIND[kind as string] ?? LIVE_TIMER_FALLBACK_SECONDS;
}

/**
 * Read `timer_seconds` off an activity spec DEFENSIVELY.
 *
 * `spec` is raw jsonb (`Record<string, unknown>`) — `@iterahq/activity-spec`
 * parses with a `strip` schema, so an extra `timer_seconds` key is simply
 * ignored there and never typed. We therefore validate it ourselves and return
 * `null` for anything that is not a sane duration, so the caller can fall back
 * to the per-kind default. Numeric strings are accepted because authored jsonb
 * routinely carries `"300"` instead of `300`.
 */
export function readTimerSecondsOverride(spec: unknown): number | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  const raw = (spec as Record<string, unknown>).timer_seconds;

  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') n = Number(raw);
  else return null;

  if (!Number.isFinite(n)) return null;
  const seconds = Math.floor(n);
  if (seconds < LIVE_TIMER_MIN_SECONDS || seconds > LIVE_TIMER_MAX_SECONDS) return null;
  return seconds;
}

/**
 * The countdown duration for one live activity: per-activity override when the
 * spec carries a valid `timer_seconds`, otherwise the per-kind default.
 * `0` means "no timer" (the instructor controls hide the start button).
 */
export function liveTimerSeconds(kind: string | null | undefined, spec?: unknown): number {
  const fallback = liveTimerDefaultSeconds(kind, spec);
  if (fallback === 0) return 0; // content kind — an override can't create a timer
  return readTimerSecondsOverride(spec) ?? fallback;
}
