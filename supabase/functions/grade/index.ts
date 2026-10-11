import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { GRADER_VERSION, canonicalJson, gradeSubmission } from '../_shared/grading.ts';
import { parseHtmlDocument } from '../_shared/html-document.ts';
import { GUEST_LESSON_IDS, GUEST_RATE } from '../_shared/guest.ts';
import { bearerToken, corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { unverifiedSubject } from '../_shared/jwt-subject.ts';
import { chargeMiss, type MissOutcome } from '../_shared/miss-charge.ts';
import { callerAddress, takeRate } from '../_shared/ratelimit.ts';
import { sha256Hex } from '../_shared/sha256.ts';

const MAX_BODY_BYTES = 64_000;
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

/** The activity as the learner's own session may read it: row level security decides, not this function. */
async function loadActivityAs(token: string, activityId: string): Promise<ActivityRow | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase anon credentials are not configured');
  const viewer = createClient(url, anonKey, {
    db: { schema: 'itera' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await viewer.from('activities').select('id,lesson_id,kind,spec').eq('id', activityId).maybeSingle();
  if (error) return null;
  return data as ActivityRow | null;
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

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await readJsonObject(request, MAX_BODY_BYTES);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const token = bearerToken(request);
    const db = serviceClient();

    const { activity_id: activityId, passed: claimedPassed, response = null, answer = null } = body;
    if (typeof activityId !== 'string' || !isUuid(activityId) || typeof claimedPassed !== 'boolean') {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (response !== null && (typeof response !== 'string' || response.length > MAX_RESPONSE_CHARS)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (canonicalJson(answer).length > MAX_ANSWER_CHARS) return json({ error: 'invalid_body' }, 400, cors);

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
      const guestGrade = gradeSubmission(guestActivity.kind, guestActivity.spec, { answer, response }, claimedPassed, parseHtmlDocument);
      return json(
        {
          verdict: guestGrade.passed ? 'pass' : 'fail',
          mode: guestGrade.mode,
          ...(guestGrade.reason ? { reason: guestGrade.reason } : {}),
          answer_hash: sha256Hex(`${guestActivity.id}\n${canonicalJson({ answer, response })}`),
          guest: true,
        },
        200,
        cors,
      );
    }

    const activity = await loadActivityAs(token, activityId);
    if (!activity) return json({ error: 'activity_not_found' }, 404, cors);

    const grade = gradeSubmission(activity.kind, activity.spec, { answer, response }, claimedPassed, parseHtmlDocument);
    const answerHash = sha256Hex(`${activity.id}\n${canonicalJson({ answer, response })}`);
    // One round trip: the learner behind the token, the rate limit, the attempt row and the progress row.
    const { data, error } = await db.rpc('record_graded_attempt', {
      p_subject: subject,
      p_activity_id: activity.id,
      p_lesson_id: activity.lesson_id,
      p_kind: activity.kind,
      p_mode: grade.mode,
      p_passed: grade.passed,
      p_claimed_passed: claimedPassed,
      p_reason: grade.reason ?? null,
      p_answer_hash: answerHash,
      p_spec_hash: sha256Hex(canonicalJson(activity.spec)),
      p_grader: GRADER_VERSION,
      p_max_per_minute: MAX_ATTEMPTS_PER_MINUTE,
    });
    if (error) throw new Error(`record_graded_attempt: ${error.message}`);
    const attempt = data as { error?: string; attempt_id?: string; graded_at?: string; user_id?: string };
    if (attempt.error === 'no_itera_profile') return json({ error: 'no_itera_profile' }, 403, cors);
    if (attempt.error === 'too_many_attempts') return json({ error: 'too_many_attempts', retryable: true }, 429, cors);

    // The server is the judge of a miss: the life goes here, never on the client's word alone.
    let miss: MissOutcome | null = null;
    if (!grade.passed && grade.mode !== 'participation' && attempt.user_id) {
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
