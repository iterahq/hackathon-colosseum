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
 *     only honest basis for an accuracy number.
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
 */
export async function persistActivityProgress(
  activityId: string,
  { passed, response }: { passed: boolean; response?: string | null }
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
    await sb.from('activity_results').insert({
      user_id: userId,
      activity_id: activityId,
      passed,
      score_internal: null,
      feedback: buildAttemptFeedback(response),
    });

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
