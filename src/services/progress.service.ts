/**
 * Shared activity-attempt persistence.
 *
 * Extracted from LessonPlayer so BOTH the solo lesson player and the live-class
 * session page write attempts the EXACT same way (per-user, RLS-scoped) — the
 * live mode only changes WHICH activity is on screen, never how results persist.
 *
 * ⚠️ HISTORY — read before trusting any accuracy number (E2E finding D2,
 * 2026-07-28): until this module was fixed, `persistActivityProgress` was only
 * ever CALLED from inside an `if (correct)` branch AND inserted `passed: true`
 * as a literal. A wrong answer therefore produced no row at all, anywhere. That
 * made `activity_results.passed` a dead column (it never held `false` outside a
 * seed fixture) and made every accuracy metric built on it structurally
 * incapable of returning anything but 100%. See `src/lib/dataQuality.ts` for the
 * cutover timestamp and why the pre-cutover history is NOT recoverable.
 *
 * The contract now:
 *   - `activity_results` gets a row on EVERY settled attempt, right or wrong,
 *     with `passed` reflecting the real outcome. This is the ATTEMPT LOG and the
 *     only honest basis for an accuracy number. Since migration 0033 the row
 *     also carries HOW LONG the learner was on the activity (`elapsed_ms` /
 *     `visible_ms`) — without it "which activity is hard" and "where do learners
 *     give up" are not measurable at all in self-paced mode.
 *   - `activity_traces` (migration 0034) gets ONE ROW PER SETTLED ATTEMPT
 *     carrying the ordered SEQUENCE of what the learner did — the HOW, where
 *     `activity_results` is the WHAT. Strictly best-effort and written AFTER
 *     the attempt has landed; see `persistActivityProgress` for why that
 *     ordering is a correctness property and not a style choice.
 *   - `progress` is the COMPLETION signal and stays monotonic: a pass promotes
 *     the row to 'completed'; a miss only ever records 'in_progress' and can
 *     never demote an activity the learner already passed.
 *   - XP is awarded on a pass only (unchanged).
 *
 * RLS keys these on itera.users.id (NOT the auth uid) — resolve the Itera-local
 * id first, else the FK silently fails.
 *
 * Returns TRUE only when the progress row actually landed, so callers never
 * celebrate an unsaved completion.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import { awardActivityXp } from '@/services/gamification.service';
import type { DurationSample } from '@/utils/activityDuration';
import {
  buildAttemptTrace,
  type RecordedAction,
  type TraceSpecSnapshot,
} from '@/utils/learningTrace';

/** Mirrors the `itera.progress_status` enum. */
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * Hard cap on the answer text stored per attempt.
 *
 * A boolean tells you HOW MANY errors a cohort made; the answer text tells you
 * WHICH error — the distractor they fell for, the order they submitted, the
 * sentence they wrote. That is the pedagogically useful half, so we keep it, but
 * free text is unbounded by nature and this row is written on every attempt by
 * every learner. 2000 characters holds a full reflection paragraph (the longest
 * thing any current kind emits) while keeping the row small enough that the
 * attempt log cannot become a blob store by accident. Longer answers are
 * TRUNCATED, never dropped, and the row says so — a silently shortened answer
 * that reads as complete would be its own species of lie.
 */
export const MAX_RESPONSE_CHARS = 2000;

/** What the attempt log stores in `activity_results.feedback` (jsonb). */
export interface AttemptFeedback {
  /** Plain-text summary of what the learner answered. */
  response?: string;
  /** Present and true only when `response` was cut at MAX_RESPONSE_CHARS. */
  response_truncated?: boolean;
  /** Original length before truncation, so the loss is measurable. */
  response_length?: number;
}

/**
 * Build the `feedback` payload for one attempt. Exported for direct unit tests —
 * the truncation rule is the kind of thing that must be pinned explicitly.
 */
export function buildAttemptFeedback(response?: string | null): AttemptFeedback {
  if (typeof response !== 'string') return {};
  const trimmed = response.trim();
  if (trimmed === '') return {};
  if (trimmed.length <= MAX_RESPONSE_CHARS) return { response: trimmed };
  return {
    response: trimmed.slice(0, MAX_RESPONSE_CHARS),
    response_truncated: true,
    response_length: trimmed.length,
  };
}

/**
 * Record one settled attempt at an activity.
 *
 * `passed` is REQUIRED on purpose. It used to be implicit (the call-site's
 * `if (correct)` guard), which is exactly how the attempt log came to hold
 * nothing but wins — an omitted-by-default flag is the bug. Making it a
 * mandatory argument means a new call-site cannot silently reintroduce D2: it
 * has to state, in the type system, what actually happened.
 *
 * `response` is the plain-text summary of WHAT the learner answered, ridden up
 * from the activity through `ActivityCompleteDetail.response` — the same channel
 * PR #193 established, deliberately reused rather than reinvented. Storing only
 * `passed` would record that a learner erred without recording the error, which
 * answers "how many got it wrong" but not the question worth asking: "wrong
 * HOW?". Note this is a SEPARATE concern from `artifact_policy` (which governs
 * whether the learner's work becomes a deliverable in their repository); this is
 * the instructor-facing attempt log.
 *
 * `duration` is REQUIRED for the same reason `passed` is, and the reasoning is
 * the one written above: an omitted-by-default field is how a column comes to
 * hold nothing but the happy path. A new call-site has to STATE what it measured
 * — including `null`, which means "not measured" and is stored as NULL rather
 * than as a fabricated zero. The only caller that legitimately passes null today
 * is the outbox replaying an entry serialised before this field existed.
 * See `src/utils/activityDuration.ts` for what the two numbers actually mean.
 *
 * `actions` is the RICH SEQUENCE of what the learner did, in WALL CLOCK. The
 * `selection` and `arrangement` families now pass it (sub-plan 1, Fase A — the
 * reducer's actions ARE the events); the unwired families do not. It stays
 * optional, unlike `passed` and `duration`, and the difference is not laziness:
 * an omitted `passed` recorded something FALSE (that is how the attempt log came
 * to hold nothing but wins), whereas an omitted `actions` records LESS — the
 * two-action trace built below is a complete account of what an unwired kind can
 * observe. Optional-where-honest, required-where-a-default-would-lie.
 *
 * `actionsTruncated` says the sequence was already cut before it got here (the
 * durable outbox trims a queued attempt so a long trace cannot blow the
 * localStorage quota and take the ANSWERS down with it). It rides separately
 * because the row must not claim a complete sequence it does not have.
 *
 * `settledAt` is the wall-clock instant the learner ANSWERED, and it is
 * REQUIRED for the reason the other required fields are: a default would lie.
 * ⚠️ It is emphatically NOT "now". Every write here can be queued by the
 * durable outbox and replayed on reconnect (`src/utils/answerOutbox.ts`), and
 * the two call sites also differ from the settle: the self-paced player writes
 * on the footer's "Continuar", after the review beat. Stamping at write time
 * would date a learner's actions to whenever their wifi came back. `null` means
 * "unknown" — an outbox entry serialised before this field existed — and yields
 * an attempt row with no trace rather than a fabricated anchor.
 *
 * `specSnapshot` is the ENUNCIADO the learner actually read, as rendered, with
 * the locale it was rendered in (migration 0037, Fase 0 of plan
 * `20260803-itera-replay-de-sessao-de-atividade`). It is OPTIONAL for the same
 * reason `actions` is: omitting it records LESS, never something false — the
 * column is NULL and NULL means "not captured", which is exactly true of every
 * attempt written by an older build.
 *
 * ⚠️ IT MUST COME FROM THE CALLER, and re-reading it here would be a bug, not a
 * simplification. The point of the snapshot is that `itera.activities.spec` is
 * mutable (trigger `activity_defs_sync_instances`, migration 0024) and
 * locale-resolved at render time; a lookup at WRITE time would fetch today's
 * wording in whatever locale is ambient — and on the outbox path "write time"
 * can be hours after the learner answered. Only the surface that rendered the
 * activity holds the truth, so only it can supply it.
 *
 * ⚠️ THIS IS THE ONLY PLACE THE TRACE MAY BE EMITTED — and the emission is
 * INSIDE this function, not at its call sites, which is a coverage property and
 * not a style one. The call sites are no longer the two the plan named: live
 * class AND every self-paced MISS now go through `writeOrQueue` →
 * `useAnswerOutbox` → here, while only the self-paced PASS still calls in
 * directly. Instrumenting the call sites would therefore have captured passes
 * in self-paced mode and nothing else — which is the exact shape of the 0028
 * defect (a log that holds only wins, and looks complete while doing it).
 *
 * Not the `ActivityRenderer` either, and not any activity component:
 * `ActivityTestHarness` mounts the very same renderer and deliberately imports
 * NOTHING from this module — that is the boundary guaranteeing an author
 * testing an activity does not pollute learner data. Emitting from the renderer
 * would break it in silence, which is a correctness reason, not a convenience.
 */
export async function persistActivityProgress(
  activityId: string,
  {
    passed,
    response,
    duration,
    settledAt,
    actions,
    actionsTruncated,
    specSnapshot,
  }: {
    passed: boolean;
    response?: string | null;
    duration: DurationSample | null;
    settledAt: number | null;
    actions?: readonly RecordedAction[];
    actionsTruncated?: boolean;
    specSnapshot?: TraceSpecSnapshot | null;
  }
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return false;

    // Progress: the completion signal. Monotonic by construction.
    let progressError: unknown = null;
    if (passed) {
      // A pass upserts with the CORRECT enum value ('completed' — NOT 'done'),
      // promoting an earlier 'in_progress' row left by a failed attempt.
      const { error } = await sb.from('progress').upsert(
        {
          user_id: userId,
          activity_id: activityId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,activity_id' }
      );
      progressError = error;
    } else {
      // A miss records that the learner REACHED and attempted this activity, but
      // must never overwrite a row that is already 'completed' — otherwise
      // re-playing a finished lesson and slipping once would erase a real
      // completion. `ignoreDuplicates` makes this an INSERT ... ON CONFLICT DO
      // NOTHING, so an existing row (of either status) is left untouched.
      const { error } = await sb.from('progress').upsert(
        {
          user_id: userId,
          activity_id: activityId,
          status: 'in_progress',
          completed_at: null,
        },
        { onConflict: 'user_id,activity_id', ignoreDuplicates: true }
      );
      progressError = error;
    }
    // The progress write is the load-bearing one; if it failed, report failure so
    // we never celebrate an unsaved completion.
    if (progressError) return false;

    // Results: the attempt log — every attempt, with the REAL outcome AND what
    // was actually answered. Wrong answers land here and nowhere else, so this
    // is what both accuracy and error analysis must read.
    // Best-effort (the per-tenant Results-API pull reads these).
    //
    // Duration rides as COLUMNS, not inside `feedback` (migration 0033). The
    // jsonb payload is where the answer's CONTENT lives — free-shaped, capped,
    // read one row at a time to see what a learner wrote. Time-on-screen is the
    // opposite: a fixed-width number that every difficulty/abandonment query
    // will aggregate over the whole table, and `itera.class_answers.elapsed_ms`
    // already set that precedent for the live-class half of the same question.
    // Burying it in jsonb would make the aggregate a cast on every row and leave
    // the meaning undocumented where `COMMENT ON COLUMN` can carry it.
    const attemptRow = {
      user_id: userId,
      activity_id: activityId,
      passed,
      score_internal: null,
      feedback: buildAttemptFeedback(response),
    };
    const { error: resultsError } = await sb.from('activity_results').insert({
      ...attemptRow,
      elapsed_ms: duration?.elapsedMs ?? null,
      visible_ms: duration?.visibleMs ?? null,
    });
    // ⚠️ DEPLOY-ORDER SEATBELT. This app auto-deploys on merge to `main`, but no
    // CI applies Itera migrations — they are run by hand. So there is a window
    // in which this build is live and migration 0033 is not, and PostgREST
    // rejects the WHOLE insert for an unknown column. Without this retry that
    // window silently stops recording attempts altogether: exactly the D2
    // failure the module doc above describes, re-created by the telemetry meant
    // to enrich it, and just as unrecoverable afterwards.
    //
    // The rule this encodes is the same one behind the missing cross-column
    // check in 0033: TELEMETRY MUST NEVER BE ABLE TO DESTROY THE RECORD IT
    // DECORATES. The attempt is worth incomparably more than its timing, so on
    // any failure we re-insert without the timing and keep the attempt.
    //
    // The retry can duplicate a row in the narrow case where the first insert
    // committed and then failed on the way back (a timeout after commit). That
    // trade is taken deliberately and in one direction only: this table already
    // holds one row per attempt with no uniqueness, so a duplicate attempt
    // slightly overcounts, while a lost attempt is unrecoverable.
    //
    // Safe to delete once 0033 is applied everywhere this build runs. Until
    // then, deleting it makes a merge-before-migrate slip cost real learner data.
    if (resultsError) {
      await sb.from('activity_results').insert(attemptRow);
    }

    // ── The TRACE (migration 0034) ───────────────────────────────────────────
    // The sequence of what the learner did, as ONE ROW. For a WIRED family
    // (`selection`, `arrangement`) that is every option chosen and un-chosen,
    // every item moved, every pair made and broken, in order; for the rest it
    // is still the honest two actions (opened, settled).
    // The shape is versioned from row one precisely because it will grow:
    // an unversioned row written before the format moved is data nobody can
    // safely interpret afterwards, and that is not fixable later.
    //
    // 🔑 WHY THIS IS A SEPARATE INSERT INTO A SEPARATE TABLE, AFTER the attempt.
    // This app auto-deploys on merge to `main` and NO CI applies Itera
    // migrations — they are run by hand. So a build is routinely live before
    // its migration is, and PostgREST rejects the WHOLE statement when it names
    // a table or column the deployed schema lacks. In 0033 that shape of
    // mistake could have stopped attempts from being recorded at all, which is
    // why the re-insert seatbelt above exists.
    //
    // Here the same window costs NOTHING structurally: the trace is its own
    // statement against its own table, issued after the attempt has already
    // landed. If `activity_traces` does not exist yet, this one statement
    // fails, we swallow it, and the attempt — the thing that actually matters —
    // is untouched. No seatbelt needed, because the failure cannot reach the
    // record it decorates. Same rule as 0033, obtained by construction rather
    // than by retry: TELEMETRY MUST NEVER BE ABLE TO DESTROY THE RECORD IT
    // DECORATES.
    //
    // ⚠️ COROLLARY FOR WHOEVER ADDS THE NEXT COLUMN HERE: adding a field to
    // THIS insert re-creates 0033's window for the trace (build ahead of
    // schema ⇒ every trace rejected until the migration is applied). Losing
    // traces is survivable where losing attempts was not, but it is still a
    // silent loss of data that cannot be re-collected — ship the migration
    // first, or accept the gap knowingly.
    //
    // 🪢 AND THE NEXT COLUMN DID ARRIVE: `spec_snapshot` / `spec_locale`
    // (migration 0037). Rather than accept that gap, the write below takes the
    // 0033 SEATBELT SHAPE — attempt WITH the snapshot, and on any failure
    // re-attempt WITHOUT it. The rule is the same one, one level down: the
    // snapshot decorates the sequence exactly as the sequence decorates the
    // attempt, so the deploy window costs SNAPSHOTS and never SEQUENCES.
    // Without the retry, merging this PR and forgetting to run
    // `db/scripts/apply-migrations.sh` would stop recording traces altogether
    // — and there is a precedent for that being forgotten: 0036 sat merged and
    // unapplied while this was written.
    // The retry cannot duplicate anything: it is the same idempotent upsert
    // against `uq_activity_traces_attempt`, so if the first statement actually
    // committed and only failed on the way back, the second is a no-op.
    //
    // 🔁 IDEMPOTENT ON RETRY. `flushOutbox` re-sends any entry whose write did
    // not land, and this function can return false AFTER a row has already been
    // committed (a timeout on the way back). Because `started_at` is derived
    // from the SETTLE instant carried through the queue — not from `now()` —
    // a replay of the same attempt derives the same anchor, and the unique
    // index on (user_id, activity_id, started_at) turns the second write into a
    // no-op. `activity_results` accepts the duplicate instead (documented above:
    // over-counting an attempt beats losing one); a trace has no such excuse,
    // because a duplicated SEQUENCE would corrupt every "how many tries" and
    // "what did they do first" question this table exists to answer.
    //
    // The whole block is wrapped so that no failure mode of the trace write —
    // including one that throws rather than returning an error — can change
    // what this function reports about the attempt.
    try {
      const trace = buildAttemptTrace({
        passed,
        duration,
        settledAt,
        actions,
        actionsTruncated,
      });
      // No trace without an origin: every `at_ms` is an offset from
      // `started_at`, so an attempt with no measured duration or no known
      // settle instant (an outbox entry serialised before those fields existed)
      // gets an attempt row and no trace, rather than a sequence dated to the
      // moment the network came back.
      if (trace) {
        // The envelope (migration 0034). Every column here is older than this
        // build and is never the reason a write is rejected.
        const traceRow = {
          user_id: userId,
          activity_id: activityId,
          schema_version: trace.schema_version,
          started_at: trace.started_at,
          actions: trace.actions,
          actions_truncated: trace.actions_truncated,
        };
        const conflict = {
          onConflict: 'user_id,activity_id,started_at',
          ignoreDuplicates: true,
        } as const;

        if (specSnapshot) {
          const { error: traceError } = await sb.from('activity_traces').upsert(
            {
              ...traceRow,
              // ⚠️ The enunciado AS THE LEARNER READ IT, not as it reads now.
              // See the corollary above and migration 0037.
              spec_snapshot: specSnapshot.spec,
              spec_locale: specSnapshot.locale,
            },
            conflict
          );
          // 0037 not applied yet ⇒ PostgREST rejects the whole statement for
          // the unknown columns. Keep the sequence; drop only its annotation.
          if (traceError) await sb.from('activity_traces').upsert(traceRow, conflict);
        } else {
          await sb.from('activity_traces').upsert(traceRow, conflict);
        }
      }
    } catch {
      // Best-effort by design. A missing table, a rejected envelope or a
      // network blip costs a trace and nothing else.
    }

    // XP: idempotent SECURITY DEFINER RPC (never double-awards). Best-effort.
    // Awarded on a pass only — a miss is recorded, not rewarded.
    if (passed) await awardActivityXp(activityId);
    return true;
  } catch {
    return false;
  }
}

/**
 * The learner's own progress rows for a set of activities, as an
 * `activityId → status` map. Missing ids simply have no entry (never reached).
 *
 * This is the READ half that never existed (E2E finding D1): the player wrote
 * progress faithfully and then booted every returning learner back to activity 1
 * because nothing ever read it back. RLS scopes `progress` to the caller; we
 * still pass the user id so the query rides the `(user_id, activity_id)` primary
 * key rather than scanning.
 *
 * Best-effort: any failure resolves to an empty map, i.e. "start from the top",
 * which is exactly the old behaviour. Resume never blocks the lesson.
 */
export async function fetchActivityProgress(
  activityIds: string[]
): Promise<Record<string, ProgressStatus>> {
  if (!isSupabaseConfigured || activityIds.length === 0) return {};
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return {};

    const { data, error } = await sb
      .from('progress')
      .select('activity_id,status')
      .eq('user_id', userId)
      .in('activity_id', activityIds);
    if (error || !data) return {};

    const map: Record<string, ProgressStatus> = {};
    for (const row of data as Array<{ activity_id: string; status: ProgressStatus }>) {
      map[row.activity_id] = row.status;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Where a returning learner should land in a lesson, given the ordered activity
 * ids and their persisted statuses.
 *
 * Rule: resume at the first activity the learner has NOT yet completed. An
 * activity attempted-but-missed is NOT completed, so the learner gets another
 * pass at it rather than carrying a silent gap forward — which is also what
 * keeps the "N/total" counter honest.
 *
 * Returns `activityIds.length` when everything is done, which the player reads
 * as "show the completion screen". Pure and total: unit-testable without a DB.
 */
export function resumeIndexFor(
  activityIds: string[],
  statuses: Record<string, ProgressStatus>
): number {
  const firstUnfinished = activityIds.findIndex((id) => statuses[id] !== 'completed');
  return firstUnfinished === -1 ? activityIds.length : firstUnfinished;
}
