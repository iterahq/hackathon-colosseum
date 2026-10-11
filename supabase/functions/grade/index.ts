import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { GRADER_VERSION, blankVerdicts, canonicalJson, checkResults, gradeSubmission, type Grade } from '../_shared/grading.ts';
import { parseHtmlDocument } from '../_shared/html-document.ts';
import { GUEST_LESSON_IDS, GUEST_RATE } from '../_shared/guest.ts';
import { bearerToken, corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { unverifiedSubject } from '../_shared/jwt-subject.ts';
import { chargeMiss, type MissOutcome } from '../_shared/miss-charge.ts';
import { callerAddress, takeRate } from '../_shared/ratelimit.ts';
import { answerKey, explanationOf, sealActivity, unsealAnswer } from '../_shared/seal.ts';
import { sealSecret } from '../_shared/seal-secret.ts';
import { sha256Hex } from '../_shared/sha256.ts';
import { checkSelfReported } from '../_shared/trace-check.ts';

const MAX_BODY_BYTES = 120_000;
const MAX_TRACE_CHARS = 60_000;
/** What `activity_results.feedback.response` keeps of an answer. */
const MAX_STORED_RESPONSE_CHARS = 2000;
const MAX_RESPONSE_CHARS = 30_000;
const MAX_ANSWER_CHARS = 8_000;
/** Answers one learner may send per minute. The player sends one per settled exercise. */
const MAX_ATTEMPTS_PER_MINUTE = 90;

interface ActivityRow {
  id: string;
  lesson_id: string;
  kind: string;
  spec: unknown;
}

/**
 * The activity, if the learner's own session may see it: row level security
 * decides that on the columns a browser can read, and the spec is then read
 * with the service role, because no browser key can read it.
 */
async function loadActivityAs(db: IteraClient, token: string, activityId: string): Promise<ActivityRow | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase anon credentials are not configured');
  const viewer = createClient(url, anonKey, {
    db: { schema: 'itera' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [visible, content] = await Promise.all([
    viewer.from('activities').select('id').eq('id', activityId).maybeSingle(),
    db.from('activities').select('id,lesson_id,kind,spec').eq('id', activityId).maybeSingle(),
  ]);
  if (visible.error || !visible.data) return null;
  if (content.error) throw new Error(`activities: ${content.error.message}`);
  return content.data as ActivityRow | null;
}

/** The activity of a lesson open to visitors, read with the service role: a guest has no session for row level security to judge. */
async function loadGuestActivity(db: IteraClient, activityId: string): Promise<ActivityRow | null> {
  const { data, error } = await db.from('activities').select('id,lesson_id,kind,spec').eq('id', activityId).eq('status', 'published').maybeSingle();
  if (error) throw new Error(`activities: ${error.message}`);
  const activity = data as ActivityRow | null;
  return activity && GUEST_LESSON_IDS.has(activity.lesson_id) ? activity : null;
}

/** The auth user behind the bearer token; `null` without a valid one. */
async function authSubjectOf(db: IteraClient, token: string): Promise<string | null> {
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

interface Judged {
  grade: Grade;
  answer: unknown;
  /** What the player may show now that there is a verdict. Never the key of an answer that missed. */
  shown: Record<string, unknown>;
}

function storedFeedback(response: string | null): Record<string, unknown> {
  const trimmed = typeof response === 'string' ? response.trim() : '';
  if (!trimmed) return {};
  if (trimmed.length <= MAX_STORED_RESPONSE_CHARS) return { response: trimmed };
  return { response: trimmed.slice(0, MAX_STORED_RESPONSE_CHARS), response_truncated: true, response_length: trimmed.length };
}

/** One submission judged: the verdict, and the part of the activity the verdict lets out. */
function judge(activity: ActivityRow, body: { answer: unknown; response: string | null; trace: unknown; claimedPassed: boolean }): Judged {
  const secret = sealSecret();
  const answer = unsealAnswer(activity, body.answer, secret);
  let grade = gradeSubmission(activity.kind, activity.spec, { answer, response: body.response }, body.claimedPassed, parseHtmlDocument);
  if (grade.mode === 'self_reported' && grade.passed) {
    const refused = checkSelfReported(activity.kind, activity.spec, { response: body.response, trace: body.trace }, parseHtmlDocument);
    if (refused) grade = { mode: grade.mode, passed: false, reason: refused };
  }
  const shown: Record<string, unknown> = { graded_by: sealActivity(activity, secret).graded_by };
  if (grade.mode === 'server') {
    const explanation = explanationOf(activity);
    if (explanation !== null) shown.explanation = explanation;
    const key = grade.passed ? answerKey(activity, secret) : null;
    if (key) shown.key = key;
    const blanks = blankVerdicts(activity.kind, activity.spec, isRecord(answer) ? answer.blanks : null);
    if (blanks) shown.blanks = grade.passed ? Object.fromEntries(Object.keys(blanks).map((id) => [id, true])) : blanks;
    const checks = typeof body.response === 'string' ? checkResults(activity.kind, activity.spec, body.response, parseHtmlDocument) : null;
    if (checks) shown.checks = checks;
  }
  return { grade, answer, shown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 2_147_483_647 ? value : null;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await readJsonObject(request, MAX_BODY_BYTES);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const token = bearerToken(request);
    const db = serviceClient();

    const { activity_id: activityId, passed: claimedPassed, response = null, answer = null, trace = null } = body;
    if (typeof activityId !== 'string' || !isUuid(activityId) || typeof claimedPassed !== 'boolean') {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (response !== null && (typeof response !== 'string' || response.length > MAX_RESPONSE_CHARS)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (canonicalJson(answer).length > MAX_ANSWER_CHARS) return json({ error: 'invalid_body' }, 400, cors);
    if (trace !== null && (!Array.isArray(trace) || JSON.stringify(trace).length > MAX_TRACE_CHARS)) return json({ error: 'invalid_body' }, 400, cors);
    const submitted = { answer, response: response as string | null, trace, claimedPassed };

    if (!token) return json({ error: 'unauthorized' }, 401, cors);
    const subject = await authSubjectOf(db, token);

    // A visitor with no account (the bearer is the anon key): the first lesson is graded by the same
    // rules and NOTHING is written: no attempt, no completion, no life. Signing in is what records.
    if (!subject) {
      // A learner's token that no longer verifies is not a visitor: it must sign in again, not be told "pass" with nothing recorded.
      if (unverifiedSubject(token)) return json({ error: 'unauthorized' }, 401, cors);
      const byAddress = await takeRate(db, 'guest-grade', callerAddress(request), GUEST_RATE);
      if (!byAddress.allowed) return json({ error: 'too_many_attempts', retryable: true }, 429, cors);
      const guestActivity = await loadGuestActivity(db, activityId);
      if (!guestActivity) return json({ error: 'guest_lesson_only' }, 403, cors);
      const guestJudged = judge(guestActivity, submitted);
      return json(
        {
          verdict: guestJudged.grade.passed ? 'pass' : 'fail',
          mode: guestJudged.grade.mode,
          ...(guestJudged.grade.reason ? { reason: guestJudged.grade.reason } : {}),
          shown: guestJudged.shown,
          answer_hash: sha256Hex(`${guestActivity.id}\n${canonicalJson({ answer: guestJudged.answer, response })}`),
          guest: true,
        },
        200,
        cors,
      );
    }

    const activity = await loadActivityAs(db, token, activityId);
    if (!activity) return json({ error: 'activity_not_found' }, 404, cors);

    const judged = judge(activity, submitted);
    const grade = judged.grade;
    const answerHash = sha256Hex(`${activity.id}\n${canonicalJson({ answer: judged.answer, response })}`);
    // One round trip: the learner behind the token, the rate limit, the attempt, the progress, the result row and the xp.
    const { data, error } = await db.rpc('record_graded_attempt_v2', {
      p: {
        subject,
        activity_id: activity.id,
        lesson_id: activity.lesson_id,
        kind: activity.kind,
        mode: grade.mode,
        passed: grade.passed,
        claimed_passed: claimedPassed,
        reason: grade.reason ?? null,
        answer_hash: answerHash,
        spec_hash: sha256Hex(canonicalJson(activity.spec)),
        grader: GRADER_VERSION,
        max_per_minute: MAX_ATTEMPTS_PER_MINUTE,
        // A player that still writes its own result row does not ask for this one.
        write_result: body.results === 'server',
        feedback: storedFeedback(response as string | null),
        elapsed_ms: wholeNumber(body.elapsed_ms),
        visible_ms: wholeNumber(body.visible_ms),
      },
    });
    if (error) throw new Error(`record_graded_attempt_v2: ${error.message}`);
    const attempt = data as { error?: string; attempt_id?: string; graded_at?: string; user_id?: string; tries?: number; misses?: number; xp_awarded?: number; was_completed?: boolean };
    if (attempt.error === 'no_itera_profile') return json({ error: 'no_itera_profile' }, 403, cors);
    if (attempt.error === 'too_many_attempts') return json({ error: 'too_many_attempts', retryable: true }, 429, cors);

    // The server is the judge of a miss: the life goes here, never on the client's word alone.
    let miss: MissOutcome | null = null;
    // Redoing an activity already passed is practice: its misses cost nothing.
    if (!grade.passed && grade.mode !== 'participation' && attempt.user_id && !attempt.was_completed) {
      try {
        miss = await chargeMiss(db, attempt.user_id, activity);
      } catch (failure) {
        console.error('grade: miss not charged', failure);
      }
    }

    return json(
      {
        verdict: grade.passed ? 'pass' : 'fail',
        mode: grade.mode,
        ...(grade.reason ? { reason: grade.reason } : {}),
        ...(miss ? { miss: { charge: miss.charge, life_lost: miss.life_lost, lesson_cap: miss.lesson_cap }, lives: miss.lives } : {}),
        shown: judged.shown,
        tries: attempt.tries ?? null,
        xp_awarded: attempt.xp_awarded ?? 0,
        attempt_id: attempt.attempt_id,
        answer_hash: answerHash,
        graded_at: attempt.graded_at,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('grade failed', error);
    return json({ error: 'internal_error', retryable: true }, 500, cors);
  }
});
