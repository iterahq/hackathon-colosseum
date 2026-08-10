/**
 * How fast the person on stage may broadcast their cursor — derived from the
 * room size, never hard-coded.
 *
 * ## Why this is a function and not a constant
 *
 * Supabase bills broadcast **per recipient**: "each broadcast message counts as
 * one message sent plus one message per subscribed client that receives it".
 * So one cursor event in a room of N costs `N + 1` messages, and the emission
 * rate multiplies it:
 *
 *     billed msgs/s = hz × (roomSize + 1)
 *
 * The Itera project is on the **Free** tier and stays there (plan Q6), whose
 * ceiling is **100 messages/s for the whole project** — and exceeding it does
 * not degrade, it DISCONNECTS clients. A fixed 5 Hz therefore works until it
 * silently doesn't:
 *
 *     room  5 → 30/s   room 10 → 55/s   room 15 → 80/s   room 20 → 105/s ✗
 *
 * A fixed cap ("max 20 with sync") pushes the failure into the future and onto
 * whoever opens the 21st seat. Deriving the rate from the room instead means
 * the feature **cannot** break the class: it degrades smoothly, and today's
 * rooms of ~5 still get the full 5 Hz.
 *
 * ## The budget, and why it is well under the ceiling
 *
 * `STAGE_CURSOR_BUDGET_MSGS_PER_SEC` is the slice of the project's Realtime
 * throughput the cursor stream may consume. It is deliberately **60 of the
 * 100**, not 100 of 100, because the cursor is not the only traffic on the
 * wire. The same project ceiling also has to absorb, per class:
 *
 *   - `stage-update` — the staged learner re-broadcasts their work on every
 *     autosave (600 ms debounce ⇒ ~1.7 events/s), and the instructor forwards
 *     each one as a fresh `stage-show`: ~2 × 1.7 × (roomSize + 1);
 *   - `answered`, `advance`, `timer`, `break`, plus presence sync on every join,
 *     leave, hand raise and `working_on` change;
 *   - a second class running at the same time.
 *
 * Spending the whole ceiling on cursors would make the *stage itself* — the
 * thing the cursor annotates — the first casualty. 60/40 leaves the control
 * plane a real margin instead of a rounding error.
 *
 * ## Floor
 *
 * Below `STAGE_CURSOR_MIN_HZ` the mirror stops being useful and starts lying:
 * at 1 Hz the pointer teleports once a second, and "move a little to the right"
 * lands on a position the learner left a second ago. A cursor that is wrong is
 * worse than no cursor, so under the floor the mirror is switched **off with a
 * visible notice** rather than shipped in a broken state.
 */

/** Supabase Free tier: messages/s across the ENTIRE project, not per room. */
export const REALTIME_CEILING_MSGS_PER_SEC = 100;

/**
 * The cursor stream's slice of that ceiling. 60 %, leaving 40 msgs/s for
 * `stage-update`/`stage-show`, `answered`, `advance`, `timer`, presence, and a
 * concurrent class. See the module docstring for the arithmetic.
 */
export const STAGE_CURSOR_BUDGET_MSGS_PER_SEC = 60;

/** Ceiling on the rate itself — Tainan's answer to Q4. Never emit faster. */
export const STAGE_CURSOR_MAX_HZ = 5;

/** Below this the mirror is switched off instead of stuttering (see docstring). */
export const STAGE_CURSOR_MIN_HZ = 2;

export interface StageCursorPlan {
  /** Emissions per second. `0` when the mirror is off. */
  hz: number;
  /** Throttle interval for the emitter. `Infinity` when the mirror is off. */
  intervalMs: number;
  /** False ⇒ the room is too large to mirror a cursor honestly on this tier. */
  enabled: boolean;
  /** Billed messages per single cursor event (`roomSize + 1`). */
  costPerEvent: number;
  /** Billed messages per second at `hz`. Always ≤ `budget` when enabled. */
  costMsgsPerSec: number;
  /** The budget this plan was computed against (echoed for reporting/tests). */
  budget: number;
  /** Largest room that still gets a mirror at this budget. */
  maxRoomSize: number;
}

/**
 * `hz = clamp(floor(budget / (roomSize + 1)), MIN, MAX)`, off below MIN.
 *
 * `roomSize` is the presence roster length (everyone in the room, emitter
 * included). Using the roster rather than the count of clients actually
 * subscribed to the cursor topic is the conservative reading: it can only
 * over-estimate the fan-out, never under-estimate it, and today every
 * participant sees the stage the moment it exists.
 */
export function stageCursorPlan(
  roomSize: number,
  budget: number = STAGE_CURSOR_BUDGET_MSGS_PER_SEC
): StageCursorPlan {
  const room = Math.max(1, Math.floor(Number.isFinite(roomSize) ? roomSize : 1));
  const costPerEvent = room + 1;
  const affordable = Math.floor(budget / costPerEvent);
  const hz = Math.min(affordable, STAGE_CURSOR_MAX_HZ);
  const enabled = hz >= STAGE_CURSOR_MIN_HZ;
  return {
    hz: enabled ? hz : 0,
    intervalMs: enabled ? Math.round(1000 / hz) : Infinity,
    enabled,
    costPerEvent,
    costMsgsPerSec: enabled ? hz * costPerEvent : 0,
    budget,
    maxRoomSize: maxMirroredRoomSize(budget),
  };
}

/**
 * The largest room that still clears `STAGE_CURSOR_MIN_HZ` on a given budget.
 * Exported so the UI can say "acima de N pessoas" instead of a magic number,
 * and so the tests assert the boundary rather than restate it.
 */
export function maxMirroredRoomSize(
  budget: number = STAGE_CURSOR_BUDGET_MSGS_PER_SEC
): number {
  return Math.max(0, Math.floor(budget / STAGE_CURSOR_MIN_HZ) - 1);
}
