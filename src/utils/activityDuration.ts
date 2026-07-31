/**
 * How long a learner spent on one activity — the pure half.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now the self-paced player collected NO duration at all:
 * `itera.activity_results` carried only `created_at`, and `elapsed_ms` existed
 * exclusively in `itera.class_answers` (live class). Without time-on-screen,
 * "which activity is hard" and "where do learners give up" are not measurable —
 * they are the two questions the telemetry plan
 * (20260731-itera-eventos-aprendizagem, Phase 1) exists to answer.
 *
 * WHAT THE NUMBERS MEAN — read this before querying either of them
 * ----------------------------------------------------------------
 * The window is the same for both: it OPENS when the activity became the one on
 * screen for this learner, and CLOSES when the learner settled their answer
 * (`onComplete`) — NOT when the row was written. In the self-paced player those
 * are different moments: a graded activity holds the feedback footer while the
 * learner reads the explanation, and only the footer's "Continuar" persists.
 * Counting that review beat would inflate every graded kind by however long the
 * learner spent reading, which is a different behaviour with a different meaning.
 *
 *   elapsedMs — WALL CLOCK across that window. Includes time with the tab in the
 *               background, the laptop lid shut, the learner at lunch. Uncapped
 *               on purpose: a cap is an invented number, and the outlier itself
 *               ("opened it and came back tomorrow") is a real signal.
 *   visibleMs — the same window MINUS every stretch where `document` was hidden
 *               (tab switched away, window minimised). This is the honest
 *               "time-on-screen" number and the one difficulty analysis should
 *               use. It is NOT "time actively working": a learner staring at a
 *               visible tab while thinking about lunch counts in full. We can
 *               observe attention leaving the page; we cannot observe it leaving
 *               the learner.
 *
 * The gap `elapsedMs - visibleMs` is itself the away/tab-switch signal.
 *
 * Neither number is an aggregate to average naively — a single overnight tab
 * moves a mean by minutes. Use medians / percentiles.
 *
 * This module is PURE (no React, no DOM, no Supabase) so every one of those
 * rules is unit-testable with a fake clock. The DOM wiring lives in
 * `src/hooks/useActivityDuration.ts`.
 */

/** One measurement of the window described above. Both fields are >= 0. */
export interface DurationSample {
  /** Wall clock, activity opened → answer settled. Includes hidden time. */
  elapsedMs: number;
  /** Same window minus time the document was hidden. `<= elapsedMs`. */
  visibleMs: number;
}

/**
 * Running tally of time spent with the document HIDDEN since the window opened.
 * Immutable — every transition returns a new tally.
 */
export interface HiddenTally {
  /** Hidden time already closed out (completed hidden stretches). */
  accumMs: number;
  /** Start of the hidden stretch currently in flight, or null if visible. */
  hiddenSince: number | null;
}

/** Open a fresh tally at `now`. `hidden` is the document state at that instant. */
export function startTally(now: number, hidden: boolean): HiddenTally {
  return { accumMs: 0, hiddenSince: hidden ? now : null };
}

/**
 * Fold one visibility transition into the tally.
 *
 * Idempotent per state: being told "hidden" twice does not restart the stretch,
 * and "visible" twice does not double-count it. `visibilitychange` firing on a
 * state that did not actually change is common enough (bfcache restores, some
 * mobile browsers) that treating it as an edge would corrupt the number.
 */
export function applyVisibility(tally: HiddenTally, hidden: boolean, now: number): HiddenTally {
  if (hidden) {
    return tally.hiddenSince === null ? { ...tally, hiddenSince: now } : tally;
  }
  if (tally.hiddenSince === null) return tally;
  return {
    accumMs: tally.accumMs + Math.max(0, now - tally.hiddenSince),
    hiddenSince: null,
  };
}

/**
 * Read the window as of `now`.
 *
 * Returns NULL when there is no origin — "not measured" is a distinct fact from
 * "took zero milliseconds", and writing 0 for an unknown would put a fabricated
 * instant answer into the attempt log. The caller stores the null.
 *
 * Clamped and rounded: `Date.now()` is wall clock and can jump backwards (NTP
 * correction, the user changing the system clock), and a negative duration is
 * not a measurement — it is noise that would sail past a `>= 0` check only by
 * being stored as a lie.
 */
export function sampleDuration(
  startedAt: number | null,
  tally: HiddenTally,
  now: number
): DurationSample | null {
  if (startedAt === null) return null;
  const elapsedMs = Math.max(0, Math.round(now - startedAt));
  const openStretch = tally.hiddenSince === null ? 0 : Math.max(0, now - tally.hiddenSince);
  const hiddenMs = Math.max(0, Math.round(tally.accumMs + openStretch));
  return {
    elapsedMs,
    // Clamped into [0, elapsedMs]: the invariant `visibleMs <= elapsedMs` is
    // enforced HERE rather than by a DB constraint on purpose — a constraint
    // violation would reject the whole INSERT and cost us the attempt row
    // itself, which is worth far more than the timing that produced it.
    visibleMs: Math.min(elapsedMs, Math.max(0, elapsedMs - hiddenMs)),
  };
}
