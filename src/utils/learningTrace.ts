/**
 * The learning-event TRACE contract — versioned, and the pure half of it.
 *
 * Plan `20260731-itera-eventos-aprendizagem`, Phase 2 (contract) + the client
 * side of Phase 3 (the row shape it writes).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR, AND WHY IT IS VERSIONED FROM DAY ONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tainan, 2026-07-31: *"você nunca vai conseguir voltar no tempo e coletar
 * esses dados"*. That single sentence is the whole argument for the plan AND
 * for the version field. A row written today with no version is a row nobody
 * can safely interpret the day the format changes — and unlike a bug, it cannot
 * be fixed afterwards, because the fix would be a re-collection that is not
 * available. `schema_version` is not bookkeeping; it is the only thing that
 * keeps the earlier history unambiguous once the shape moves.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WE ARE BUILDING THE PIPE, NOT THE CONTENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The rich sequence — every click, every option swapped before submitting,
 * every backtrack — DOES NOT EXIST YET. It arrives when the activities become
 * reducers (`(state, action) => state`, sub-plan 1 of the same plan); the
 * reducer's actions ARE the events, which is exactly why instrumenting the ~53
 * handlers spread over 23 files by hand is the cost this design avoids.
 *
 * So the shape below is designed for the sequence that does not exist yet, and
 * is FILLED today with what the persistence path actually observes: which
 * activity, which outcome, what was answered, and how long it took (columns
 * `elapsed_ms` / `visible_ms`, migration 0033). A trace written today is a
 * two-action trace, and it says so honestly rather than padding itself with
 * invented detail.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ACTION SHAPE — `{ type, at_ms, payload? }`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `at_ms` is the TIMESTAMP of the action, expressed as MILLISECONDS SINCE THE
 * TRACE ORIGIN — not a wall clock. Three reasons, in order of weight:
 *
 *  1. The origin is already on the row (`started_at`), once. Repeating an
 *     absolute ISO instant on every action would re-store, per action, the
 *     information the row already carries — for a payload whose entire purpose
 *     is to hold hundreds of actions. Absolute time is recoverable by addition,
 *     exactly and losslessly.
 *  2. Replay schedules actions at `t + offset`; offsets are the form replay
 *     wants, so storing them avoids a subtraction against a parsed date on
 *     every action of every trace.
 *  3. `Date.now()` is wall clock and jumps (NTP correction, a user changing the
 *     system clock). One origin plus offsets degrades to "the whole trace is
 *     shifted"; per-action wall clocks degrade to a sequence that is out of
 *     order with itself — which is a corrupted trace that still looks valid.
 *
 * `type` is an open vocabulary AT READ TIME and a closed union AT WRITE TIME.
 * That asymmetry is the point: this build may only emit types it knows about
 * (so a future emitter has to declare itself in the type system), while a
 * reader must never choke on a type it has not heard of — that is what lets the
 * vocabulary grow without a version bump and without stranding old readers.
 *
 * `payload` is a free object, absent when the action carries no detail. NEW
 * PAYLOAD KEYS NEVER BREAK AN OLD ROW, because nothing reads a payload key it
 * did not ask for. This is the forward-compatibility rule the plan needs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN TO BUMP `schema_version` — read before touching it
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BUMP when an existing field changes MEANING or SHAPE:
 *   - `at_ms` stops being an offset from `started_at`,
 *   - `started_at` stops being the moment the activity opened,
 *   - `actions` stops being a chronologically-ordered array,
 *   - an existing payload key changes units or semantics.
 *
 * DO NOT BUMP for additive change:
 *   - a new action `type`,
 *   - a new payload key on an existing type,
 *   - a new COLUMN on the table (that is not part of this envelope).
 *
 * The distinction is the whole value of the field. A version that ticks on
 * every additive change tells you nothing about whether an old row is readable;
 * a version that ticks only on reinterpretation tells you exactly that.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY *NOT* IN THE TRACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The learner's answer TEXT (`activity_results.feedback.response`, capped at
 * 2000 chars) and the durations (`activity_results.elapsed_ms` /
 * `visible_ms`). Both already live on the attempt row, one table over, written
 * in the same call. Copying them here would mean two places to keep in step and
 * two places to purge; the trace is the HOW, `activity_results` is the WHAT.
 * Correlate on `(user_id, activity_id, created_at)`.
 *
 * The one number that IS restated is the outcome, in the terminal action's
 * payload, because a replay has to know which verdict the learner was shown.
 *
 * The DOM wiring is `src/hooks/useActivityDuration.ts`; the write is
 * `src/services/progress.service.ts`. This module is PURE — no React, no DOM,
 * no Supabase — so every rule above is unit-testable with fixed inputs.
 */
import type { DurationSample } from '@/utils/activityDuration';

/**
 * Version of the ENVELOPE this build writes. Stored on every row
 * (`itera.activity_traces.schema_version`), never inferred at read time.
 */
export const TRACE_SCHEMA_VERSION = 1;

/**
 * Hard cap on actions per trace, mirroring `MAX_RESPONSE_CHARS` in
 * `progress.service.ts` and for the same reason: this row is written on every
 * attempt by every learner, and a payload that is unbounded by nature turns an
 * attempt log into a blob store by accident.
 *
 * 500 comfortably holds any sequence the current surfaces can produce (today's
 * traces have TWO actions) and leaves headroom for the reducer sequences of
 * sub-plan 1. It is a CLIENT policy, on purpose: there is no length constraint
 * in the database, so raising this number later needs no migration — see the
 * `0034` header for why the DB validates shape and not size.
 *
 * Over the cap the trace is TRUNCATED, never dropped, the row says so
 * (`actions_truncated`), and the terminal action always survives — a truncated
 * trace that silently lost its outcome would read as an abandoned attempt.
 */
export const MAX_TRACE_ACTIONS = 500;

/**
 * The action vocabulary THIS BUILD may emit. Closed on purpose: a new emitter
 * has to add its type here, which is a reviewable one-line diff rather than an
 * ad-hoc string appearing in the data.
 *
 * Today there are exactly two, and both are things the persistence path
 * genuinely observed — not placeholders:
 *
 *   `activity_opened`  — the trace origin, at offset 0 by construction. This is
 *                        the same instant `elapsed_ms` measures from (the
 *                        activity became the one on screen for this learner).
 *   `attempt_settled`  — the learner settled their answer (`onComplete`). Its
 *                        `at_ms` EQUALS `elapsed_ms` on the attempt row, by
 *                        construction rather than by coincidence.
 *
 * Everything between them is the sequence sub-plan 1 will supply.
 */
export type LearnerActionType = 'activity_opened' | 'attempt_settled';

/** One action, as WRITTEN by this build. */
export interface LearnerAction {
  type: LearnerActionType;
  /** Milliseconds since the trace origin. Never a wall clock. Always >= 0. */
  at_ms: number;
  /** Type-specific detail. Absent when the action carries none. */
  payload?: Record<string, unknown>;
}

/**
 * One action, as READ BACK from storage.
 *
 * `type` is widened to `string` deliberately: a row written by a NEWER build
 * can carry a vocabulary this build has never heard of, and the reader's job is
 * to hand it over intact, not to reject it. Narrowing here would make every
 * older reader lose data the moment the vocabulary grows.
 */
export type StoredLearnerAction = Omit<LearnerAction, 'type'> & { type: string };

/**
 * The envelope, exactly as it maps onto a row of `itera.activity_traces`.
 *
 * Field names are snake_case because these ARE the storage names — `actions`
 * lands verbatim in a jsonb column, so `actions -> 0 ->> 'at_ms'` in a SQL
 * query has to spell what is written here. camelCase would mean a translation
 * layer between the type and every query anyone ever writes against it.
 */
export interface LearningTrace {
  schema_version: number;
  /** ISO-8601. The wall-clock instant that `at_ms: 0` refers to. */
  started_at: string;
  actions: LearnerAction[];
  /** True when the action list was cut at `MAX_TRACE_ACTIONS`. */
  actions_truncated: boolean;
}

/** A trace read back from storage, with its version reported rather than assumed. */
export interface StoredLearningTrace {
  /** As stored. `0` when the row carried no usable version at all. */
  schema_version: number;
  /** True when the row was written by a build NEWER than this one. */
  from_future: boolean;
  started_at: string | null;
  actions: StoredLearnerAction[];
  actions_truncated: boolean;
}

/** Non-negative, finite, integral milliseconds — or 0. Never NaN, never negative. */
function offset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * Build the trace for one settled attempt.
 *
 * Returns NULL when either `duration` or `settledAt` is missing, and that is a
 * correctness rule rather than a shortcut: every `at_ms` is an offset from an
 * origin, so a trace with no origin is a list of numbers that mean nothing.
 *
 * ⚠️ `settledAt` IS THE INSTANT THE LEARNER ANSWERED — never the instant the
 * row was written, and the two are routinely different. A failed write is
 * queued in the durable outbox (`src/utils/answerOutbox.ts`) and replayed when
 * the network returns, which on school wifi can be minutes or hours later. If
 * this were `Date.now()` at write time, every attempt that went through the
 * queue would be back-dated to the reconnection and the whole trace would slide
 * with it — a learning trace whose clock is the network's clock is not a
 * learning trace. So the caller stamps it AT THE ORIGIN and carries it through.
 *
 * That choice buys a second property for free: `started_at` becomes a stable
 * function of the attempt itself, so a re-sent outbox entry derives the SAME
 * anchor and the DB can deduplicate on `(user_id, activity_id, started_at)`
 * (unique index, migration 0034). A `now()`-at-write-time anchor would make
 * every retry a new row and silently double-count the attempt.
 *
 * Both null cases come from the same place: an outbox entry serialised by a
 * client older than the field. Those replay as an attempt row with no trace,
 * which is the honest outcome — inventing an anchor would be worse than having
 * none.
 *
 * @param actions the RICH sequence, when the caller has one. Nobody passes it
 *   today — it is the seam sub-plan 1 plugs into, and it is typed and tested so
 *   that plugging in is a call-site change and nothing else. Its absence is NOT
 *   the `passed`-style footgun (an omitted flag that silently records a lie):
 *   the two-action trace below is a COMPLETE account of what this build
 *   observed, so omitting the parameter records less, never something false.
 */
export function buildAttemptTrace({
  passed,
  duration,
  settledAt,
  actions = [],
}: {
  passed: boolean;
  duration: DurationSample | null;
  /**
   * Wall clock of the SETTLE (the learner's `onComplete`), not of the write.
   * Injected rather than read here so the builder stays pure — and so the
   * caller is forced to state which instant it means.
   */
  settledAt: number | null;
  actions?: readonly LearnerAction[];
}): LearningTrace | null {
  if (!duration || settledAt === null || !Number.isFinite(settledAt)) return null;

  const elapsed = offset(duration.elapsedMs);
  const middle = actions.map((a) => ({ ...a, at_ms: offset(a.at_ms) }));

  const full: LearnerAction[] = [
    { type: 'activity_opened', at_ms: 0 },
    ...middle,
    // `at_ms` here IS `activity_results.elapsed_ms`. The two are the same
    // measurement written in two places, which is what makes a trace joinable
    // to its attempt row without an FK — see the module doc.
    { type: 'attempt_settled', at_ms: elapsed, payload: { passed } },
  ];

  if (full.length <= MAX_TRACE_ACTIONS) {
    return {
      schema_version: TRACE_SCHEMA_VERSION,
      started_at: new Date(settledAt - elapsed).toISOString(),
      actions: full,
      actions_truncated: false,
    };
  }

  // Keep the HEAD and the terminal action. The head is where the strategy is
  // (what the learner tried first), and the outcome must never be the thing
  // that falls off the end.
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    started_at: new Date(settledAt - elapsed).toISOString(),
    actions: [...full.slice(0, MAX_TRACE_ACTIONS - 1), full[full.length - 1]],
    actions_truncated: true,
  };
}

/**
 * Structural check for ONE stored action. Deliberately says nothing about the
 * `type` string or the payload contents — validating the vocabulary here is
 * exactly how a reader stops being able to read newer rows.
 */
function isStoredAction(value: unknown): value is StoredLearnerAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.type !== 'string') return false;
  if (typeof a.at_ms !== 'number' || !Number.isFinite(a.at_ms) || a.at_ms < 0) return false;
  if (a.payload !== undefined) {
    if (!a.payload || typeof a.payload !== 'object' || Array.isArray(a.payload)) return false;
  }
  return true;
}

/**
 * Read a stored trace back, TOTALLY and TOLERANTLY.
 *
 * This is the function that makes `schema_version` worth having. It never
 * throws, and specifically:
 *
 *  - an UNKNOWN (newer) `schema_version` is reported via `from_future`, not
 *    rejected. The caller decides whether it can act on the actions; the reader
 *    does not get to discard a row because it postdates this build. Refusing
 *    here would mean an old tab, an old cached bundle or a stale analysis
 *    script silently dropping the newest data — the one failure this whole
 *    design exists to prevent.
 *  - an unknown action `type` and unknown payload keys pass through VERBATIM.
 *  - structurally broken entries are skipped individually; one bad action does
 *    not cost the rest of the sequence.
 *
 * Returns null only when the input is not an object at all.
 */
export function readTrace(row: unknown): StoredLearningTrace | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;

  const version =
    typeof r.schema_version === 'number' && Number.isFinite(r.schema_version)
      ? r.schema_version
      : 0;

  const rawActions = Array.isArray(r.actions) ? r.actions : [];

  return {
    schema_version: version,
    from_future: version > TRACE_SCHEMA_VERSION,
    started_at: typeof r.started_at === 'string' ? r.started_at : null,
    actions: rawActions.filter(isStoredAction),
    actions_truncated: r.actions_truncated === true,
  };
}
