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
 * THE PIPE SHIPPED FIRST; THE CONTENT ARRIVES BY FAMILY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This envelope shipped (PR #247) carrying exactly two actions — opened and
 * settled — because the rich sequence did not exist. It now exists for the
 * `selection` and `arrangement` families: every option chosen and un-chosen,
 * every item moved, every pair made and broken, in order, with offsets.
 *
 * The vocabulary is NOT declared here. It is derived from
 * `src/utils/activityFamilies.ts`, which names the five reducer families
 * (plan `20260731-itera-padroes-reducer-atividades`, Fase A) and owns the
 * action union of each. Two parallel lists would drift, and an action type in
 * this file that belonged to no family would be exactly the ad-hoc
 * instrumentation the plan exists to replace.
 *
 * A trace written for an unwired family is still a two-action trace, and it
 * says so honestly rather than padding itself with invented detail.
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
 *     ⚠️ `spec_snapshot` / `spec_locale` (migration 0037) are exactly that case
 *     and the version did NOT move: `started_at`, `at_ms` and `actions` all
 *     still mean what they meant, so a v1 row written before that migration is
 *     read the same way as one written after it. That is the whole point of the
 *     field — bumping it for additive change would destroy the only signal
 *     saying whether an OLD row is interpretable.
 *     ⚠️ `pedagogical_context` (migration 0038, Fase 1 of the LCPWCI plan) is
 *     the same case AGAIN, and it did not move the version either. It carries
 *     its OWN `schema` field (`PEDAGOGICAL_CONTEXT_SCHEMA`) so that the shape of
 *     the tag can evolve without either version ever making a claim about the
 *     other.
 *     ⚠️ `outcome` (migration 0040) is the same case a THIRD time, and it is
 *     the interesting one: it arrives together with a new action type
 *     (`attempt_abandoned`), and BOTH are additive. `started_at` is still the
 *     moment the activity opened, `at_ms` is still an offset, `actions` is
 *     still chronological — a v1 row written before 0040 is read exactly the
 *     way a v1 row written after it is. What changed is that the table now
 *     holds two KINDS of row, which is what `outcome` exists to make askable
 *     without unnesting the jsonb.
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
import type { LearnerActionType, RecordedAction } from '@/utils/activityFamilies';
import {
  readPedagogicalContext,
  type StoredPedagogicalContext,
} from '@/utils/pedagogicalContext';

export type { LearnerActionType, RecordedAction } from '@/utils/activityFamilies';

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
 * The action vocabulary THIS BUILD may emit — re-exported from
 * `src/utils/activityFamilies.ts`, which is where it is DEFINED, per family.
 *
 * Closed at write time on purpose: a new emitter has to add its type to a
 * family, which is a reviewable one-line diff rather than an ad-hoc string
 * appearing in the data. Open at read time — see `StoredLearnerAction`.
 *
 * Two of the names are not interactions at all; they are the ends of the
 * envelope, and this module writes them itself:
 *
 *   `activity_opened`  — the trace origin, at offset 0 by construction. This is
 *                        the same instant `elapsed_ms` measures from (the
 *                        activity became the one on screen for this learner).
 *   `attempt_settled`  — the learner settled their answer (`onComplete`). Its
 *                        `at_ms` EQUALS `elapsed_ms` on the attempt row, by
 *                        construction rather than by coincidence.
 *
 * Everything between them comes from the activity, as `RecordedAction`s.
 */

/**
 * The ENUNCIADO the learner actually read, captured with the attempt
 * (migration 0037 — Fase 0 of plan
 * `20260803-itera-replay-de-sessao-de-atividade`, Tainan TG 2026-08-04).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A TRACE WITHOUT THIS IS NOT REPRODUCIBLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An action says `option_selected {option_id: 'b'}`. What `b` SAID lives in
 * `itera.activities.spec` — mutable jsonb, no version, no hash. The trigger
 * `activity_defs_sync_instances` (migration 0024) rewrites it across every
 * instance without looking at whether attempts exist, and the i18n backfill of
 * #253 already did exactly that in place (migration 0035 calls those *"lossy
 * edits to authored content"*). So re-rendering the live spec to replay an old
 * attempt shows TODAY's wording — and in the WATCHER's language, because
 * `resolveLocalizedSpec` picks the locale at render time from localStorage.
 *
 * A replay that diverges from what the learner saw is worse than no replay: it
 * looks like the truth. Hence the snapshot, and hence it ships BEFORE any UI —
 * the interface can be built whenever, the data cannot be collected twice.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PAIR IS ONE FACT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `spec` and `locale` travel together in one object rather than as two loose
 * parameters, because a snapshot whose language is unknown is ambiguous
 * exactly where it matters. There is no way to pass one without the other.
 *
 * ⚠️ `spec` is the spec AS RENDERED — `programs.service` has already collapsed
 * the `{pt,en}` bags for the learner's locale. The one exception is inherited,
 * not introduced here: `sandbox_scenario` specs are deliberately left
 * UNRESOLVED (that runtime resolves its own bags), so for that kind the
 * snapshot holds bags. Either way `locale` is what a reader needs to render it
 * the way the learner saw it.
 */
export interface TraceSpecSnapshot {
  /** The activity spec exactly as this learner was rendered it. */
  spec: Record<string, unknown>;
  /** The locale that resolution used — the language the learner actually read. */
  locale: string;
}

/**
 * Build the snapshot for one attempt, or NULL when there is nothing honest to
 * store.
 *
 * Pure and total, like everything else in this module. Returns null for a
 * missing, non-object or EMPTY spec rather than writing `{}`: an empty object
 * would read as "this activity had no enunciado", which is a claim, whereas
 * NULL already means "not captured" on the column (see the 0037 comment).
 */
export function buildSpecSnapshot(
  spec: Record<string, unknown> | null | undefined,
  locale: string
): TraceSpecSnapshot | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  if (Object.keys(spec).length === 0) return null;
  if (typeof locale !== 'string' || locale === '') return null;
  return { spec, locale };
}

/** One action, as WRITTEN by this build. `at_ms` is already an offset. */
export interface LearnerAction {
  type: LearnerActionType;
  /** Milliseconds since the trace origin. Never a wall clock. Always >= 0. */
  at_ms: number;
  /** Type-specific detail. Absent when the action carries none. */
  payload?: Record<string, unknown>;
}

/**
 * `RecordedAction` — what an activity hands up — is DEFINED in
 * `src/utils/activityFamilies.ts` and re-exported above. It lives there because
 * the activity tree is forbidden from importing this module at all (see
 * `src/test/traceEmissionBoundary.test.ts`): the author harness mounts those
 * same components, and the missing import is the guarantee that a curator
 * testing an activity writes nothing.
 */

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
 * HOW A TRACE ENDED — `itera.activity_traces.outcome` (migration 0040).
 *
 * Open at read time, closed at write time, exactly like the action vocabulary:
 * this build may only write what it declares here, and a reader must hand back
 * verbatim whatever a newer build wrote (`'expired'`, `'interrupted'`,
 * `'force_advanced'` are all plausible next values, and the column deliberately
 * carries no CHECK).
 */
export const TRACE_OUTCOMES = ['settled', 'abandoned'] as const;
export type TraceOutcome = (typeof TRACE_OUTCOMES)[number];

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
  /**
   * Whether the learner ANSWERED or LEFT (migration 0040).
   *
   * ⚠️ REQUIRED on this type even though the COLUMN is nullable, and the
   * asymmetry is the point: NULL on the column means *"written before the
   * question existed"*, which is a fact about history that no build writing
   * today is entitled to reproduce. A trace this build constructs always knows
   * which of the two it is, so making the field optional would only create a
   * way to forget — and an omitted-by-default flag is exactly how
   * `activity_results.passed` came to hold nothing but wins.
   */
  outcome: TraceOutcome;
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
  /**
   * As stored, WIDENED to `string` and NULL for "not captured" — the same
   * open-at-read asymmetry `StoredLearnerAction.type` uses.
   *
   * ⚠️ NULL is not `'settled'`. It means the row predates migration 0040 (or
   * the client that wrote it did). Callers that want the settled population
   * must ask `outcome !== 'abandoned'`, never `outcome === 'settled'` — the
   * latter silently drops the entire history written before this column.
   */
  outcome: string | null;
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
 * @param actions the RICH sequence, in WALL CLOCK (`RecordedAction`), rebased
 *   here against the origin this function derives. Activities of a WIRED family
 *   pass it (see `FAMILY_EMITTED` in `activityFamilies.ts`); the rest do not,
 *   and their absence is NOT the `passed`-style footgun (an omitted flag that
 *   silently records a lie): a two-action trace is a COMPLETE account of what an
 *   unwired kind observed, so omitting the parameter records less, never
 *   something false.
 * @param actionsTruncated the caller already dropped actions before getting
 *   here — today only the durable outbox does, to keep a queued attempt from
 *   blowing the localStorage quota. It is OR'd into the row's flag because a
 *   trace that was cut somewhere upstream and does not say so is a sequence
 *   that reads as complete while missing its middle.
 */
export function buildAttemptTrace({
  passed,
  duration,
  settledAt,
  actions = [],
  actionsTruncated = false,
}: {
  passed: boolean;
  duration: DurationSample | null;
  /**
   * Wall clock of the SETTLE (the learner's `onComplete`), not of the write.
   * Injected rather than read here so the builder stays pure — and so the
   * caller is forced to state which instant it means.
   */
  settledAt: number | null;
  actions?: readonly RecordedAction[];
  actionsTruncated?: boolean;
}): LearningTrace | null {
  if (!duration || settledAt === null || !Number.isFinite(settledAt)) return null;

  const elapsed = offset(duration.elapsedMs);
  // REBASE. The origin is derived exactly the way `started_at` is below, so the
  // two can never disagree. Clamped into [0, elapsed] rather than dropped:
  //  · below 0 — an action recorded before the player armed its origin (the
  //    component mounts a tick before the resume gate lifts). Clamping keeps
  //    the action AND keeps the DB envelope check (`at_ms >= 0`) satisfied,
  //    which matters because that check rejects the WHOLE row, not the action.
  //  · above `elapsed` — a stray recorded during the settle itself. Letting it
  //    exceed the terminal action would put the sequence out of order with
  //    itself, which is a corrupted trace that still looks valid.
  // Order is preserved regardless: the list is chronological by construction,
  // and clamping is monotonic.
  const originMs = settledAt - elapsed;
  const middle: LearnerAction[] = actions.map((a) => ({
    type: a.type,
    at_ms: Math.min(elapsed, offset(a.at - originMs)),
    ...(a.payload ? { payload: a.payload } : {}),
  }));

  const full: LearnerAction[] = [
    { type: 'activity_opened', at_ms: 0 },
    ...middle,
    // `at_ms` here IS `activity_results.elapsed_ms`. The two are the same
    // measurement written in two places, which is what makes a trace joinable
    // to its attempt row without an FK — see the module doc.
    { type: 'attempt_settled', at_ms: elapsed, payload: { passed } },
  ];

  return envelope(originMs, full, actionsTruncated, 'settled');
}

/**
 * Close an envelope over an ordered action list, truncating from the MIDDLE if
 * it exceeds `MAX_TRACE_ACTIONS`.
 *
 * Keeps the HEAD and the terminal action. The head is where the strategy is
 * (what the learner tried first), and the ending must never be the thing that
 * falls off the end — a truncated trace that silently lost its terminal action
 * would read as an abandoned attempt, and now that abandonment is a real thing
 * this table records, that misreading would no longer be merely confusing.
 */
function envelope(
  originMs: number,
  full: LearnerAction[],
  actionsTruncated: boolean,
  outcome: TraceOutcome
): LearningTrace {
  const fits = full.length <= MAX_TRACE_ACTIONS;
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    started_at: new Date(originMs).toISOString(),
    actions: fits ? full : [...full.slice(0, MAX_TRACE_ACTIONS - 1), full[full.length - 1]],
    actions_truncated: fits ? actionsTruncated : true,
    outcome,
  };
}

/**
 * Build the trace for one ABANDONED attempt — an activity that was opened,
 * rendered, dwelt on, and left without a settled answer.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1,
 * approved by Tainan TG 2026-08-04. Storage: `activity_traces.outcome =
 * 'abandoned'` (migration 0040).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT `buildAttemptTrace` WITH A FLAG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The two differ in the one thing that makes a trace interpretable: WHERE THE
 * ORIGIN COMES FROM.
 *
 * A settled trace derives its origin by subtraction — `settledAt - elapsedMs` —
 * because the settle is the instant the caller actually holds, and the two
 * numbers must agree by construction so that the terminal action's `at_ms`
 * equals `activity_results.elapsed_ms`.
 *
 * An abandonment has no settle. Its origin is the instant the activity OPENED,
 * which the surface already holds directly (the same value it hands to
 * `useActivityDuration`). Deriving it by subtraction from a "left at" instant
 * would reintroduce the very drift the direct value avoids, and there is no
 * `activity_results` row for the two numbers to agree with anyway.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE DWELL RIDES IN THE TERMINAL PAYLOAD HERE, UNLIKE A SETTLED TRACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The module header says durations are deliberately NOT restated in the trace,
 * because they already live on `activity_results` one table over. For an
 * abandonment that reason evaporates: THERE IS NO `activity_results` ROW, on
 * purpose (writing one as `passed: false` would count non-attempts as failures
 * and wreck every accuracy number — see migration 0040). So this row is the
 * only place the dwell can live, and "how long did they stay before leaving" is
 * the single most useful number an abandonment carries.
 *
 * @param startedAt wall clock of the OPEN — the trace origin, held by the
 *   surface that rendered the activity.
 * @param leftAt wall clock of the moment the surface went away. Used only to
 *   bound the sequence; the dwell itself comes from `duration`, which is the
 *   measurement that knows about hidden time.
 * @param reason WHY the surface went away, verbatim into the terminal payload.
 * @returns null when there is no usable origin — the same rule
 *   `buildAttemptTrace` applies, for the same reason: offsets with no anchor
 *   are a list of numbers that mean nothing.
 */
export function buildAbandonmentTrace({
  startedAt,
  leftAt,
  duration,
  reason,
  actions = [],
  actionsTruncated = false,
}: {
  startedAt: number | null;
  leftAt: number;
  duration: DurationSample | null;
  reason: string;
  actions?: readonly RecordedAction[];
  actionsTruncated?: boolean;
}): LearningTrace | null {
  if (startedAt === null || !Number.isFinite(startedAt)) return null;
  if (!Number.isFinite(leftAt)) return null;

  // The dwell the terminal action reports. `duration` is authoritative when
  // present (it is the only thing that knows how much of the window was
  // actually on screen); the wall-clock difference is the fallback for a
  // surface that never armed a tally.
  const elapsed = offset(duration ? duration.elapsedMs : leftAt - startedAt);
  const visible = duration ? Math.min(elapsed, offset(duration.visibleMs)) : null;

  const middle: LearnerAction[] = actions.map((a) => ({
    type: a.type,
    at_ms: Math.min(elapsed, offset(a.at - startedAt)),
    ...(a.payload ? { payload: a.payload } : {}),
  }));

  const full: LearnerAction[] = [
    { type: 'activity_opened', at_ms: 0 },
    ...middle,
    {
      type: 'attempt_abandoned',
      at_ms: elapsed,
      payload: {
        reason,
        elapsed_ms: elapsed,
        ...(visible === null ? {} : { visible_ms: visible }),
      },
    },
  ];

  return envelope(startedAt, full, actionsTruncated, 'abandoned');
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
    // Verbatim, never coerced and never defaulted. An unknown value from a
    // newer build passes through; a NULL column stays NULL, because "written
    // before the question existed" is a different fact from "settled" and
    // collapsing them here would hide it from every caller at once.
    outcome: typeof r.outcome === 'string' && r.outcome !== '' ? r.outcome : null,
  };
}

/**
 * THE DEGRADATION LADDER, as pure data — the write rungs for ONE trace row,
 * most-decorated first.
 *
 * Lives here rather than in `progress.service.ts` because it is the part that
 * has to be REASONED about and therefore the part that has to be testable
 * without a database: which columns may be dropped, in which order, and — the
 * rule this function exists to enforce — which one may never be dropped at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A LADDER AT ALL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PostgREST rejects the WHOLE statement for ONE unknown column. So any moment
 * in which this build is live and a decorating column is not yet in the
 * database costs every trace, not just the annotation — unless the client
 * degrades.
 *
 * ⚠️ THAT WINDOW GOT MUCH SMALLER ON 2026-08-04 AND DID NOT CLOSE. Until then
 * merging applied nothing here and a human had to run
 * `db/scripts/apply-migrations.sh`; 0036, 0037 and 0038 sat merged-and-unapplied
 * for DAYS, which is why the enunciado and the tagging of every attempt settled
 * in that window are gone for good. `.github/workflows/db-apply.yml` now applies
 * on merge (see db/README.md). But merging starts the app deploy and the apply
 * run CONCURRENTLY with nothing ordering them, a failed apply STOPS at the
 * failing file leaving later ones pending, and a restore or a fresh environment
 * reproduces the same state from scratch. Days became minutes. Minutes are still
 * a window, and a ladder is cheap.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY EACH RUNG DROPS EXACTLY ONE MIGRATION'S WORTH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The three decorations (0037's enunciado, 0038's pedagogical context, 0040's
 * outcome) can land at different times — the apply is per-file and stops at the
 * first failure. A single "try decorated, else try bare" retry would throw away
 * an ALREADY APPLIED decoration whenever the newest one was missing — paying for
 * 0040's rollout with 0037's data, the same category of mistake as paying for
 * telemetry with the record it decorates.
 *
 * Rungs are ordered NEWEST-DECORATION-FIRST, so the window costs exactly the
 * annotations the deployed schema genuinely cannot store and nothing else.
 * ⚠️ WHOEVER ADDS THE NEXT COLUMN: add a rung at the TOP, not a branch.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 THE ONE RUNG THAT DOES NOT EXIST — AND WHY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `outcome` is droppable for a SETTLED trace and NOT droppable for an ABANDONED
 * one, and the asymmetry is a correctness rule rather than caution.
 *
 * Dropping an annotation costs DETAIL: the row says less than it could. NULL
 * `spec_snapshot` means "enunciado not captured"; NULL `pedagogical_context`
 * means "tag not captured". Both are true statements.
 *
 * Dropping `outcome` from an ABANDONED row does not cost detail — it produces a
 * row that reads, to every query and every future reader, as a SETTLED ATTEMPT.
 * That is a FALSE record, and it would silently inflate the settled-attempt
 * population with rows where nobody ever answered: the D2 defect (an attempt
 * log that only ever held wins) re-created from the other side.
 *
 * So when the schema cannot store `outcome`, an abandonment is NOT WRITTEN. It
 * returns to the durable outbox and waits, which is a bounded and recoverable
 * loss; a false settled attempt is neither.
 *
 * Every rung is the same idempotent upsert against `uq_activity_traces_attempt`
 * (`user_id, activity_id, started_at`), so a rung that actually committed and
 * only failed on the way back makes the next one a no-op — the ladder can never
 * duplicate a sequence.
 *
 * @returns the rungs to attempt in order. EMPTY is a meaningful answer and the
 *   caller must honour it: it means this row cannot be written truthfully by
 *   any degradation, so it must not be written at all.
 */
export function traceWriteRungs({
  row,
  trace,
  specSnapshot,
  pedagogicalContext,
}: {
  /** The 0034 envelope columns. Every one of them is older than this build. */
  row: Record<string, unknown>;
  trace: Pick<LearningTrace, 'outcome'>;
  specSnapshot?: TraceSpecSnapshot | null;
  /**
   * Structurally `object` rather than the concrete `PedagogicalContext`: this
   * module must not import from `pedagogicalContext.ts`, which already imports
   * FROM here (`StoredPedagogicalContext` rides on `ContextualisedTraceEvent`).
   * The rungs never read a field of it — the whole object goes into one jsonb
   * column verbatim, which is the ADR-2 property.
   */
  pedagogicalContext?: object | null;
}): Array<Record<string, unknown>> {
  const withOutcome = { outcome: trace.outcome };
  const withSnapshot = specSnapshot
    ? { spec_snapshot: specSnapshot.spec, spec_locale: specSnapshot.locale }
    : {};
  const withContext = pedagogicalContext ? { pedagogical_context: pedagogicalContext } : {};

  const rungs: Array<Record<string, unknown>> = [
    { ...row, ...withSnapshot, ...withContext, ...withOutcome },
  ];

  // 🔒 Below this line every rung has NO `outcome`, i.e. lands as NULL, i.e.
  // reads as a pre-0040 row. Only a settled trace may say that about itself.
  if (trace.outcome !== 'settled') return rungs;

  if (pedagogicalContext) rungs.push({ ...row, ...withSnapshot, ...withContext });
  if (specSnapshot) rungs.push({ ...row, ...withSnapshot });
  rungs.push(row);
  return rungs;
}

/**
 * ONE EVENT, with the context that makes it answerable years later.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1:
 * *"Contexto pedagógico em TODO evento"*. This type is where that requirement
 * becomes literally true.
 *
 * The context is stored ONCE, on the row (migration 0038), because every event
 * of a trace belongs to the same attempt of the same activity — copying it onto
 * each action would re-store per action what the row already carries, which is
 * the same argument that makes `at_ms` an offset instead of a wall clock, on a
 * payload built to hold hundreds of actions. Denormalising is the READER's job,
 * and this is the reader.
 */
export interface ContextualisedTraceEvent {
  /** The attempt's activity. Never null on a real row: it is a NOT NULL FK. */
  activity_id: string | null;
  /** The envelope version of the row this event came from. */
  schema_version: number;
  /** The trace origin — the instant `at_ms: 0` refers to. */
  started_at: string | null;
  /** Milliseconds since the origin, exactly as stored. */
  at_ms: number;
  /**
   * The absolute instant, ISO-8601 — `started_at + at_ms`, computed here so
   * every consumer does not re-derive it (and get the rounding subtly wrong).
   * Null when the row carried no usable origin.
   */
  at: string | null;
  type: string;
  payload?: Record<string, unknown>;
  /**
   * How the ATTEMPT this event belongs to ended (`activity_traces.outcome`,
   * migration 0040) — denormalised onto every event for the same reason the
   * pedagogical context is: an analysis pass over events must be able to
   * separate "what learners do before answering" from "what learners do before
   * leaving" without re-joining to the row.
   *
   * ⚠️ NULL means NOT CAPTURED (pre-0040 row), not `'settled'`.
   */
  outcome: string | null;
  /**
   * ⚠️ NULL means NOT CAPTURED — a row settled before migration 0038, or by an
   * older client, or one whose write had to degrade during a deploy window. It
   * NEVER means "look it up on `itera.activities`": the tag there is today's,
   * and re-tagging history is precisely what capturing it here prevents.
   */
  pedagogical_context: StoredPedagogicalContext | null;
}

/**
 * Explode one stored trace row into its events, each carrying the row's
 * pedagogical context and its absolute timestamp.
 *
 * TOTAL and TOLERANT, like `readTrace` (which it is built on): a row that is not
 * an object yields `[]`, structurally broken actions are skipped individually,
 * unknown action types and payload keys pass through verbatim, and a context
 * written by a newer build is reported rather than rejected.
 *
 * This is the seam ADR-2 asks for. Deriving the Learning and Mastery layers is
 * a pass over these records — offline, over rows already collected — instead of
 * a client change followed by a wait for new data.
 */
export function flattenTraceEvents(row: unknown): ContextualisedTraceEvent[] {
  const trace = readTrace(row);
  if (!trace) return [];
  const r = row as Record<string, unknown>;

  const activityId = typeof r.activity_id === 'string' ? r.activity_id : null;
  const context = readPedagogicalContext(r.pedagogical_context);
  const originMs = trace.started_at ? Date.parse(trace.started_at) : NaN;

  return trace.actions.map((action) => ({
    activity_id: activityId,
    schema_version: trace.schema_version,
    started_at: trace.started_at,
    at_ms: action.at_ms,
    at: Number.isFinite(originMs) ? new Date(originMs + action.at_ms).toISOString() : null,
    type: action.type,
    ...(action.payload ? { payload: action.payload } : {}),
    outcome: trace.outcome,
    pedagogical_context: context,
  }));
}
