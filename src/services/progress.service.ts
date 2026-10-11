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
import { submitForGrading } from '@/services/grade.service';
import { awardActivityXp } from '@/services/gamification.service';
import type { DurationSample } from '@/utils/activityDuration';
import {
  buildAbandonmentTrace,
  buildAttemptTrace,
  traceWriteRungs,
  type RecordedAction,
  type TraceSpecSnapshot,
} from '@/utils/learningTrace';
import type { AbandonmentReason } from '@/utils/abandonment';
import type { PedagogicalContext } from '@/utils/pedagogicalContext';
import { activitiesToReopen, REOPENED_PROGRESS_STATUS } from '@/utils/lessonProgressReset';

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
 * `pedagogicalContext` is WHAT THE ACTIVITY WAS FOR — template, family, mental
 * structures, metaphor, difficulty, objective (migration 0038, Fase 1 of plan
 * `20260803-itera-learning-control-plane-prototipo`). Optional for the reason
 * `specSnapshot` is: omitting it records LESS, never something false.
 *
 * ⚠️ IT COMES FROM THE CALLER FOR THE SAME REASON THE SNAPSHOT DOES, and here
 * the reason is stronger rather than weaker. A join at analysis time would tag
 * a five-year-old attempt with TODAY's grammar, and ADR-5 guarantees the
 * grammar moves — structures enter and leave on measured explanatory power. A
 * trace tagged by join therefore re-tags itself every time the grammar changes,
 * and the Fase 4 ablation ends up measuring its own bookkeeping.
 *
 * ⚠️ IT MUST COME FROM THE CALLER, and re-reading it here would be a bug, not a
 * simplification. The point of the snapshot is that `itera.activities.spec` is
 * mutable (trigger `activity_defs_sync_instances`, migration 0024) and
 * locale-resolved at render time; a lookup at WRITE time would fetch today's
 * wording in whatever locale is ambient — and on the outbox path "write time"
 * can be hours after the learner answered. Only the surface that rendered the
 * activity holds the truth, so only it can supply it.
 *
 * ⚠️ THE TRACE IS EMITTED FROM THIS MODULE AND NOWHERE ELSE — and, for a
 * CREDITED attempt, from inside this function rather than at its call sites,
 * which is a coverage property and not a style one. The call sites are no
 * longer the two the plan named: live
 * class AND every self-paced MISS now go through `writeOrQueue` →
 * `useAnswerOutbox` → here, while only the self-paced PASS still calls in
 * directly. Instrumenting the call sites would therefore have captured passes
 * in self-paced mode and nothing else — which is the exact shape of the 0028
 * defect (a log that holds only wins, and looks complete while doing it).
 *
 * The module has THREE trace entry points and the set is closed by test
 * (`src/test/traceEmissionBoundary.test.ts`): this function (settled + credited),
 * `persistGuestActivityTrace` (settled, NEVER credited — ADR-6), and
 * `persistActivityAbandonment` (opened and left). All three funnel into the same
 * `writeSettledTrace`/`traceWriteRungs` pair, so there is one place where a
 * trace row is actually shaped.
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
    pedagogicalContext,
  }: {
    passed: boolean;
    response?: string | null;
    duration: DurationSample | null;
    settledAt: number | null;
    actions?: readonly RecordedAction[];
    actionsTruncated?: boolean;
    specSnapshot?: TraceSpecSnapshot | null;
    pedagogicalContext?: PedagogicalContext | null;
  }
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return false;

    // Progress: the completion signal. The SERVER writes it, after grading the
    // answer itself (`grade` edge function): a completion this client could
    // write on its own word would prove nothing, and the database refuses one
    // (migration 0191). The verdict shown to the learner stays the local one;
    // the server's is what is recorded. A pass the server does not confirm, or
    // an answer it never received, reports failure so we never celebrate an
    // unsaved completion.
    const verdict = await submitForGrading({ activityId, passed, response, actions });
    if (!verdict) return false;
    if (passed && verdict.verdict !== 'pass') return false;

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
    // 🪜 AND THEN A SECOND COLUMN ARRIVED: `pedagogical_context` (migration
    // 0038, Fase 1 of the LCPWCI plan). Two decorations from two hand-applied
    // migrations means the retry is no longer a pair but a LADDER — see the
    // block below. The rule it enforces is unchanged; what changes is that
    // dropping the NEWEST annotation must not also drop an older one the
    // deployed schema can perfectly well store.
    //
    // ⚠️ HISTORICAL NOTE ON THE TWO PARAGRAPHS ABOVE (added 2026-08-04, with the
    // `outcome` column): "hand-applied" and "forgetting to run
    // apply-migrations.sh" WERE TRUE WHEN THEY WERE WRITTEN, and the forgetting
    // actually happened — 0036, 0037 and 0038 sat merged-and-unapplied for days,
    // and the enunciado and tagging of every attempt settled in that window are
    // gone. `.github/workflows/db-apply.yml` now applies on merge (db/README.md).
    // The ladder stays, because the window shrank rather than closed: the deploy
    // and the apply race, a failed apply stops at its file, and a restore starts
    // from nothing. Days became minutes.
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
    // The call is wrapped inside `writeSettledTrace` so that no failure mode of
    // the trace write — including one that throws rather than returning an
    // error — can change what this function reports about the attempt.
    //
    // 🔱 IT IS A CALL AND NO LONGER A BLOCK (2026-08-05). See
    // `writeSettledTrace` below for why the sequence had to stop being welded
    // to the credit.
    await writeSettledTrace(sb, userId, activityId, {
      passed,
      duration,
      settledAt,
      actions,
      actionsTruncated,
      // ⚠️ The enunciado AS THE LEARNER READ IT, not as it reads now. See the
      // corollary above and migration 0037.
      specSnapshot,
      // ⚠️ What the activity was FOR, as tagged when the learner attempted it —
      // never as tagged today. Migration 0038.
      pedagogicalContext,
    });

    // XP: idempotent SECURITY DEFINER RPC (never double-awards). Best-effort.
    // Awarded on a pass only — a miss is recorded, not rewarded.
    if (passed) await awardActivityXp(activityId);
    return true;
  } catch {
    return false;
  }
}

/** The Supabase client, as this module already obtains it. */
type SupabaseClient = ReturnType<typeof getSupabase>;

/** Everything a SETTLED trace needs, and deliberately nothing else. */
interface SettledTraceInput {
  passed: boolean;
  duration: DurationSample | null;
  settledAt: number | null;
  actions?: readonly RecordedAction[];
  actionsTruncated?: boolean;
  specSnapshot?: TraceSpecSnapshot | null;
  pedagogicalContext?: PedagogicalContext | null;
}

/**
 * Write the trace for ONE settled attempt. Best-effort, never throws.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔱 WHY THIS IS A FUNCTION AND NOT THE BLOCK IT USED TO BE (2026-08-05)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Because SEQUENCE and CREDIT are different questions, and welding them
 * together silently answered the second one for anybody who only meant to ask
 * the first.
 *
 * The guest carve-out (ADR-6, plan `20260728-itera-guest-link-aula-sincrona`,
 * shipped 2026-07-28 19:47Z) exists for a sound reason: a sales demo must not
 * leave `progress` / `activity_results` / XP rows on a paying cohort's content.
 * It was implemented as an empty `if (guest)` branch at the ONE call site that
 * had a guest — `LiveSessionPage.handleComplete`.
 *
 * Three days later (2026-07-31 20:01Z) the trace write was added INSIDE
 * `persistActivityProgress`. That was the right place for it — see the coverage
 * argument in that function's docblock, and `src/test/traceEmissionBoundary.test.ts`
 * which locks it. But it meant the trace inherited an exclusion that had been
 * written about progress rows, and nobody decided that. A DEFECT OF
 * COMPOSITION: two correct changes whose combination was never anybody's
 * intent. Measured cost: 36 guest answers settled post-deploy and produced ZERO
 * traces, and the sequences are not recoverable — the same "você nunca vai
 * conseguir voltar no tempo e coletar esses dados" that migration 0034 exists
 * to answer.
 *
 * Tainan settled it by voice, 2026-08-05T16:44Z: *"Sim, convidado gera trace de
 * aprendizagem, mas fica fora da análise — só analytics interna. Então dá pra
 * dar replay, mas não vai pra analytics."*
 *
 * So the sequence is extracted here, and `persistGuestActivityTrace` below can
 * ask for it WITHOUT asking for the credit. ADR-6 is untouched: a guest still
 * writes no `progress`, no `activity_results` and no XP, and the way that is
 * guaranteed is that this function CANNOT write them — not that a caller
 * remembers not to.
 *
 * ⚠️ NEW CALLERS: this is not a shortcut for skipping progress. The only reason
 * to reach for it is a learner whose attempt must be OBSERVED but never
 * CREDITED, and today that is exactly one population (link-invited guests). A
 * signed-in learner reaching this function without `persistActivityProgress`
 * would produce a sequence with no attempt row behind it — a trace that says
 * somebody answered while the attempt log says nobody did, which is worse than
 * either record alone. `src/test/traceEmissionBoundary.test.ts` keeps the set of
 * entry points closed so a third one has to declare itself.
 */
async function writeSettledTrace(
  sb: SupabaseClient,
  userId: string,
  activityId: string,
  {
    passed,
    duration,
    settledAt,
    actions,
    actionsTruncated,
    specSnapshot,
    pedagogicalContext,
  }: SettledTraceInput
): Promise<boolean> {
  try {
    const trace = buildAttemptTrace({ passed, duration, settledAt, actions, actionsTruncated });
    // No trace without an origin: every `at_ms` is an offset from `started_at`,
    // so an attempt with no measured duration or no known settle instant (an
    // outbox entry serialised before those fields existed) gets an attempt row
    // and no trace, rather than a sequence dated to the moment the network came
    // back.
    if (!trace) return false;

    // The envelope (migration 0034). Every column here is older than this build
    // and is never the reason a write is rejected.
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

    // 🪜 THE DEGRADATION LADDER — most decorated first, bare envelope last.
    //
    // There are THREE decorations from THREE separately-applied migrations
    // (0037's enunciado, 0038's pedagogical context, 0040's outcome), and they
    // can land at different times. A single "try decorated, else try bare"
    // retry would throw away an ALREADY-APPLIED decoration whenever the newest
    // one was missing — paying for 0038's rollout with 0037's data, which is
    // the same category of mistake as paying for telemetry with the record it
    // decorates.
    //
    // So the rungs are ordered NEWEST-DECORATION-FIRST and each one drops
    // exactly one migration's worth of columns. The window costs the
    // annotations the deployed schema genuinely cannot store, and nothing else.
    // Identical rungs are skipped, so an undecorated attempt is still exactly
    // one statement.
    //
    // Every rung is the same idempotent upsert against
    // `uq_activity_traces_attempt`, so a rung that actually committed and only
    // failed on the way back makes the next one a no-op — the ladder can never
    // duplicate a sequence.
    //
    // ⚠️ WHOEVER ADDS THE NEXT COLUMN: add a rung at the TOP of
    // `traceWriteRungs` (src/utils/learningTrace.ts), not a branch here. The
    // ladder lives there rather than in this function because the ORDER, and
    // the one rung that must NOT exist, are the part that has to be reasoned
    // about — and reasoning that cannot be unit-tested without a database is
    // reasoning nobody checks.
    const rungs = traceWriteRungs({ row: traceRow, trace, specSnapshot, pedagogicalContext });
    for (const rung of rungs) {
      const { error } = await sb.from('activity_traces').upsert(rung, conflict);
      if (!error) return true;
    }
    return false;
  } catch {
    // Best-effort by design. A missing table, a rejected envelope or a network
    // blip costs a trace and nothing else.
    return false;
  }
}

/**
 * Record the SEQUENCE of one settled attempt by a LINK-INVITED GUEST — and
 * nothing else.
 *
 * Tainan, by voice 2026-08-05T16:44Z: *"Sim, convidado gera trace de
 * aprendizagem, mas fica fora da análise — só analytics interna. Então dá pra
 * dar replay, mas não vai pra analytics."*
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT WRITES, AND WHAT IT STRUCTURALLY CANNOT WRITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Writes ONE row, in `itera.activity_traces`. It does not write — and has no
 * code path that could write:
 *
 *   · `progress`          — ADR-6. A demo must not mark a paying cohort's
 *                           content as completed by somebody who is not in it.
 *   · `activity_results`  — ADR-6, and ADR-4's reason on top of it: that table
 *                           IS the attempt log every accuracy number reads, and
 *                           a sales visitor in it is a staged number wearing a
 *                           measured one's clothes.
 *   · XP                  — ADR-6. Obviously.
 *
 * ⚠️ ADR-6 IS NOT BEING REVERSED, IT IS BEING READ PRECISELY. It was written
 * about durable per-learner PROGRESS. The trace is not progress: it credits
 * nothing, unlocks nothing, and appears in no cohort total (see the consumer
 * audit in `src/test/traceEmissionBoundary.test.ts`). It is the observation of
 * a sequence, and observing a demo visitor is exactly what makes the demo
 * reviewable afterwards.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔑 `guestUserId` IS REQUIRED, AND IT IS A GUARD RATHER THAN A PARAMETER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The write is still keyed on `getIteraUserId()` — RLS (`traces_rw_self`) would
 * reject anything else, and a client-supplied `user_id` that RLS accepted would
 * be a far worse bug than the one this function fixes. What `guestUserId` does
 * is ASSERT that the session doing the writing is still the guest the caller
 * observed. A guest's Supabase session lives in the same `localStorage` slot as
 * an ordinary login (`GuestLiveRoute` applies it with `setSession`), so "the
 * signed-in user changed between the answer and the write" is a real sequence
 * of events on a demo laptop — and attributing a visitor's sequence to whoever
 * logged in next is precisely the contamination ADR-4 exists to prevent.
 *
 * Mismatch ⇒ FALSE and no write. Losing a demo trace is cheap; a mis-attributed
 * one is not, and it is not detectable afterwards.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ BEST-EFFORT AND DELIBERATELY *NOT* QUEUED IN THE DURABLE OUTBOX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every other write on the live path goes through `writeOrQueue`
 * (`src/hooks/useAnswerOutbox.ts`) so school wifi dropping for 30s does not cost
 * an answer. This one does not, and the asymmetry is the point:
 *
 *   · The outbox resolves the WRITER at DRAIN time — `sendOutboxEntry` calls
 *     into this module, which calls `getIteraUserId()` then. A guest entry
 *     draining after the guest session is gone would hit the guard above and
 *     return false…
 *   · …and `flushOutbox` never discards on failure (by design — that is what
 *     makes it durable for answers). So the entry would be immortal: one of the
 *     200 localStorage slots, permanently occupied by a write that can never
 *     succeed, crowding out real answers.
 *   · And the thing being protected does not justify that. A guest trace is
 *     telemetry with no downstream credit — the same tier as the trace inside
 *     `persistActivityProgress`, whose failure is already swallowed. The guest's
 *     `class_answers` row (which IS what the professor's report reads) keeps its
 *     outbox durability, unchanged.
 *
 * @returns TRUE only when the row actually landed. Callers should `void` it: a
 *   guest must never be made to wait on telemetry.
 */
export async function persistGuestActivityTrace(
  activityId: string,
  {
    guestUserId,
    passed,
    duration,
    settledAt,
    actions,
    actionsTruncated,
    specSnapshot,
    pedagogicalContext,
  }: SettledTraceInput & {
    /** `itera.users.id` of the guest, from `useGuestMode()`. See the guard above. */
    guestUserId: string;
  }
): Promise<boolean> {
  if (!isSupabaseConfigured || !guestUserId) return false;
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    // 🔒 The guard. Not belt-and-braces — see the docblock.
    if (!userId || userId !== guestUserId) return false;

    return await writeSettledTrace(sb, userId, activityId, {
      passed,
      duration,
      settledAt,
      actions,
      actionsTruncated,
      specSnapshot,
      pedagogicalContext,
    });
  } catch {
    return false;
  }
}

/**
 * Record ONE ABANDONED attempt — an activity that was opened and left without a
 * settled answer.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1,
 * approved by Tainan TG 2026-08-04. The RULE for what counts is in
 * `src/utils/abandonment.ts`; this function does not re-decide it, it only
 * writes what the caller already judged.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SEPARATE FUNCTION AND NOT A FLAG ON `persistActivityProgress`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Because `persistActivityProgress` writes THREE things — `progress`,
 * `activity_results` and the trace — and an abandonment must write exactly ONE
 * of them:
 *
 *   · NOT `activity_results`. That table is the ATTEMPT LOG, and a row there is
 *     a claim that the learner attempted. Recording an abandonment as
 *     `passed: false` would count non-attempts as failures and make every
 *     accuracy number in the product wrong — the D2 defect (a log that only
 *     ever held wins) in mirror image, and just as unrecoverable once mixed in.
 *   · NOT `progress`. Opening something is not progress on it, and
 *     `resumeIndexFor` already lands a returning learner on the first activity
 *     that is not `completed`.
 *   · NOT XP. Obviously.
 *
 * A boolean parameter would have made all three conditional and left the
 * default — the dangerous direction — one forgotten `if` away. A separate
 * function makes the wrong write unreachable rather than merely unlikely.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔁 IDEMPOTENT, AT THREE LAYERS, ON THE SAME KEY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A beacon can double-fire (unmount and `pagehide` in the same breath), and a
 * queued entry is re-sent until it lands. The identity of the attempt is
 * `(activity, origin)` and it is enforced three times over:
 *
 *   1. in-process — `useAbandonmentBeacon` fires once per origin;
 *   2. in the outbox — one entry per `abandonment:<activityId>` target;
 *   3. in the database — this upsert is `on conflict do nothing` against
 *      `uq_activity_traces_attempt` (`user_id, activity_id, started_at`), and
 *      `started_at` IS the origin, carried through the queue rather than
 *      re-derived. A second beacon for the same attempt is a no-op, not an
 *      error and not a second row.
 *
 * And it can never overwrite a real attempt: `ignoreDuplicates` means this
 * write yields to whatever is already there. The converse race — an abandonment
 * landing first and then shadowing the learner's real answer — is closed one
 * layer up, by `revokeQueuedAbandonment` at settle time; see that function.
 *
 * ⚠️ AND IT NEVER DEGRADES INTO A LIE. If migration 0040 is not applied yet,
 * there is no rung that can say this row is an abandonment, so
 * `traceWriteRungs` returns a single rung and this function returns FALSE —
 * sending the entry back to the durable outbox, which retries it on the next
 * drain. Writing it without `outcome` would leave a row that reads as a settled
 * attempt, which is worse than not writing it. Since 2026-08-04 that window is
 * minutes rather than days (`db-apply` applies on merge; see db/README.md), but
 * the deploy and the apply still race, so the branch is live code and not a
 * theoretical one.
 *
 * @returns TRUE only when the row actually landed, so the outbox knows whether
 *   to keep the entry. Unlike the trace inside `persistActivityProgress` — which
 *   is best-effort because it decorates something more valuable — THIS write IS
 *   the record. There is nothing else for it to protect.
 */
export async function persistActivityAbandonment(
  activityId: string,
  {
    startedAt,
    leftAt,
    duration,
    reason,
    actions,
    actionsTruncated,
    specSnapshot,
    pedagogicalContext,
  }: {
    /** The trace origin — when the activity opened. NOT derived by subtraction. */
    startedAt: number;
    /** When the surface went away. */
    leftAt: number;
    duration: DurationSample | null;
    reason: AbandonmentReason;
    actions?: readonly RecordedAction[];
    actionsTruncated?: boolean;
    /**
     * ⚠️ THE SAME TWO ANNOTATIONS A SETTLED ROW CARRIES, and they are not
     * optional in spirit: an abandonment without the enunciado and without the
     * pedagogical tag cannot be read next to the attempts it should be compared
     * against, and "which cell of the grammar matrix gets abandoned most" — the
     * question this data exists for — is a question about the tag.
     */
    specSnapshot?: TraceSpecSnapshot | null;
    pedagogicalContext?: PedagogicalContext | null;
  }
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return false;

    const trace = buildAbandonmentTrace({
      startedAt,
      leftAt,
      duration,
      reason,
      actions,
      actionsTruncated,
    });
    if (!trace) return false;

    const rungs = traceWriteRungs({
      row: {
        user_id: userId,
        activity_id: activityId,
        schema_version: trace.schema_version,
        started_at: trace.started_at,
        actions: trace.actions,
        actions_truncated: trace.actions_truncated,
      },
      trace,
      specSnapshot,
      pedagogicalContext,
    });

    for (const rung of rungs) {
      const { error } = await sb.from('activity_traces').upsert(rung, {
        onConflict: 'user_id,activity_id,started_at',
        ignoreDuplicates: true,
      });
      if (!error) return true;
    }
    // Every rung was rejected. The commonest cause by far is migration 0040 not
    // being applied yet, and the honest answer is to keep the entry queued
    // rather than to write something the schema cannot label.
    return false;
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
  return (await fetchActivityProgressOrNull(activityIds)) ?? {};
}

/**
 * The same read, telling a FAILED read (`null`) from "no progress" (`{}`). A
 * caller that reconciles local state against the server needs the difference:
 * an outage must not read as the server saying nothing was ever completed.
 */
export async function fetchActivityProgressOrNull(
  activityIds: string[]
): Promise<Record<string, ProgressStatus> | null> {
  if (!isSupabaseConfigured) return null;
  if (activityIds.length === 0) return {};
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return null;

    const { data, error } = await sb
      .from('progress')
      .select('activity_id,status')
      .eq('user_id', userId)
      .in('activity_id', activityIds);
    if (error || !data) return null;

    const map: Record<string, ProgressStatus> = {};
    for (const row of data as Array<{ activity_id: string; status: ProgressStatus }>) {
      map[row.activity_id] = row.status;
    }
    return map;
  } catch {
    return null;
  }
}

/** One settled attempt of the learner's own, as the attempt log holds it. */
export interface LoggedAttempt {
  passed: boolean;
  response?: string;
  /** `created_at` of the row, in ms. */
  settledAt: number;
}

/** Per activity: the newest attempt, and the newest one that passed. */
export interface LatestAttempts {
  latest: LoggedAttempt;
  latestPass?: LoggedAttempt;
}

/** Newest-first rows read per lesson load; a learner retrying 500 times is not a lesson. */
const LATEST_ATTEMPTS_LIMIT = 500;

/**
 * The learner's own newest attempts for a set of activities, read back from
 * `activity_results`. This is what lets an answered exercise re-open answered
 * on ANOTHER device: `progress` says `completed` or not, and a miss is
 * `in_progress` — the same value a lesson reset leaves behind.
 *
 * Resolves to `null` when the read FAILED, which is not the same as `{}` ("no
 * attempts"): a caller reconciling local state must not treat an outage as the
 * server saying nothing was ever answered.
 */
export async function fetchLatestAttempts(
  activityIds: string[]
): Promise<Record<string, LatestAttempts> | null> {
  if (!isSupabaseConfigured) return null;
  if (activityIds.length === 0) return {};
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return null;

    const { data, error } = await sb
      .from('activity_results')
      .select('activity_id,passed,feedback,created_at')
      .eq('user_id', userId)
      .in('activity_id', activityIds)
      .order('created_at', { ascending: false })
      .limit(LATEST_ATTEMPTS_LIMIT);
    if (error || !data) return null;

    const map: Record<string, LatestAttempts> = {};
    for (const row of data as Array<{
      activity_id: string;
      passed: boolean;
      feedback: AttemptFeedback | null;
      created_at: string;
    }>) {
      const attempt: LoggedAttempt = {
        passed: row.passed === true,
        response: row.feedback?.response,
        settledAt: Date.parse(row.created_at),
      };
      const entry = (map[row.activity_id] ??= { latest: attempt });
      if (attempt.passed && !entry.latestPass) entry.latestPass = attempt;
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * A trace is stamped by the learner's browser and the attempt row by the
 * database: how far apart the two may sit and still be the same attempt.
 */
const TRACE_CLOCK_SLACK_MS = 5 * 60_000;

/** Traces read back per activity: enough to step over abandoned rows and later retries. */
const ANSWER_TRACES_LIMIT = 8;

/**
 * The action sequence of the learner's own attempt that settled at `settledAt`, as `RecordedAction`s — the shape an activity hands up and reads
 * back through `priorAnswer`. Abandoned traces are never an answer.
 *
 * Best-effort: any failure resolves to `[]`, and the exercise re-opens locked
 * without the picked answer drawn.
 */
export async function fetchAnswerActions(
  activityId: string,
  settledAt: number,
  passed?: boolean
): Promise<RecordedAction[]> {
  if (!isSupabaseConfigured || !activityId) return [];
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return [];

    const { data, error } = await sb
      .from('activity_traces')
      .select('started_at,actions,outcome')
      .eq('user_id', userId)
      .eq('activity_id', activityId)
      .order('started_at', { ascending: false })
      .limit(ANSWER_TRACES_LIMIT);
    if (error || !data) return [];

    const rows = data as Array<{
      started_at: string;
      outcome: string | null;
      actions: Array<{ type: RecordedAction['type']; at_ms: number; payload?: Record<string, unknown> }>;
    }>;
    // The trace of THIS attempt is the one that settled nearest to it. An
    // attempt can have no trace at all (a replayed one carries no duration), and
    // then the previous attempt's picks must not be drawn as this one's.
    let trace: (typeof rows)[number] | undefined;
    let nearest = TRACE_CLOCK_SLACK_MS;
    for (const row of rows) {
      if (row.outcome === 'abandoned' || !Array.isArray(row.actions)) continue;
      const last = row.actions[row.actions.length - 1];
      // Two attempts a few seconds apart: the outcome tells them apart where
      // the two clocks cannot.
      if (passed !== undefined && last?.type === 'attempt_settled' && last.payload?.passed !== passed) continue;
      const settled = Date.parse(row.started_at) + (last?.at_ms ?? 0);
      const distance = Math.abs(settled - settledAt);
      if (distance <= nearest) {
        nearest = distance;
        trace = row;
      }
    }
    if (!trace || !Array.isArray(trace.actions)) return [];
    const origin = Date.parse(trace.started_at);
    return trace.actions.map((action) => ({
      type: action.type,
      at: origin + action.at_ms,
      ...(action.payload ? { payload: action.payload } : {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Reopen the learner's OWN completed activities for a lesson — the database half
 * of "resetar a lição para todos".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS RUNS ON THE LEARNER'S CLIENT AND NOT THE INSTRUCTOR'S
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `itera.progress` carries exactly one write policy, `progress_rw_self`
 * (`FOR ALL USING user_id = itera.current_itera_user_id()`). The instructor's
 * two policies are `progress_select_instructor` / `progress_select_admin` —
 * SELECT only. So the professor can SEE that a learner completed an activity and
 * has no statement that can change it: reverting from his own client is not
 * merely unimplemented, it is rejected by RLS.
 *
 * The reset broadcast already reaches every connected learner
 * (`LESSON_RESET_EVENT` → `LiveSessionPage`), and each learner IS allowed to
 * update their own rows. So the revert rides that broadcast and each client
 * reverts itself. ⚠️ COROLLARY: a learner who is offline when the professor
 * resets never runs it — the cut lives in a broadcast, not in a durable column,
 * so there is nothing for a late joiner to catch up on.
 *
 * WHAT IT WRITES: `itera.progress`, and only rows that are currently
 * `completed`, and only to `in_progress` with `completed_at` cleared. It does
 * NOT write `activity_results`, `activity_traces` or XP, and has no code path
 * that could: the previous attempt really happened, the professor's post-class
 * report reads it, and the reset was never about erasing history — see
 * `src/utils/lessonProgressReset.ts` for why reopening beats deleting.
 *
 * Best-effort by design: it is invoked from an effect on the learner's screen
 * mid-class, and a failed revert must not take the class down. Returns the ids
 * actually reopened so a caller can tell "nothing to do" from "it did not land".
 */
export async function reopenLessonProgress(activityIds: string[]): Promise<string[]> {
  if (!isSupabaseConfigured || activityIds.length === 0) return [];
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return [];

    const reopen = activitiesToReopen(activityIds, await fetchActivityProgress(activityIds));
    if (reopen.length === 0) return [];

    const { error } = await sb
      .from('progress')
      .update({ status: REOPENED_PROGRESS_STATUS, completed_at: null })
      .eq('user_id', userId)
      .in('activity_id', reopen);
    return error ? [] : reopen;
  } catch {
    return [];
  }
}

/**
 * Where a returning learner should land in a lesson, given the ordered activity
 * ids and their persisted statuses.
 *
 * Rule: resume at the first activity the learner has NOT yet ANSWERED. A
 * completed activity is answered; so is one in `answered` — the exercises this
 * learner settled on this device, hit or miss (`lessonAnswerStorage`). A miss
 * moves the learner on in-session, so a reload must land in the same place:
 * re-opening it blank is what let a refresh erase the result. The miss still
 * does not count as done — the "N/total" counter reads `completed` only — and
 * the learner retries it deliberately, from the activity itself.
 *
 * Returns `activityIds.length` when everything is answered, which the player
 * reads as "show the completion screen". Pure and total: unit-testable without a DB.
 */
export function resumeIndexFor(
  activityIds: string[],
  statuses: Record<string, ProgressStatus>,
  answered: ReadonlySet<string> = new Set()
): number {
  const firstUnfinished = activityIds.findIndex(
    (id) => statuses[id] !== 'completed' && !answered.has(id)
  );
  return firstUnfinished === -1 ? activityIds.length : firstUnfinished;
}
