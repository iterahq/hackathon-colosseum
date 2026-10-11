import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { GRADER_VERSION, canonicalJson, gradeSubmission } from '../_shared/grading.ts';
import { parseHtmlDocument } from '../_shared/html-document.ts';
import { bearerToken, corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
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

async function iteraUserOf(db: IteraClient, token: string): Promise<string | 'unauthorized' | 'no_itera_profile'> {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return 'unauthorized';
  const { data: identity, error: identityError } = await db
    .from('identities')
    .select('user_id')
    .eq('provider_subject', data.user.id)
    .limit(1)
    .maybeSingle();
  if (identityError) throw new Error(`identities: ${identityError.message}`);
  return identity ? (identity.user_id as string) : 'no_itera_profile';
}

async function recentAttempts(db: IteraClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from('graded_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) throw new Error(`graded_attempts count: ${error.message}`);
  return count ?? 0;
}

/** The completion is written here and nowhere else. A row already completed keeps its time. */
async function recordProgress(db: IteraClient, userId: string, activityId: string, passed: boolean): Promise<void> {
  const key = { user_id: userId, activity_id: activityId };
  if (!passed) {
    const { error } = await db
      .from('progress')
      .upsert({ ...key, status: 'in_progress', completed_at: null }, { onConflict: 'user_id,activity_id', ignoreDuplicates: true });
    if (error) throw new Error(`progress miss: ${error.message}`);
    return;
  }
  const completion = { status: 'completed', completed_at: new Date().toISOString(), written_by_client: false };
  const { data, error } = await db
    .from('progress')
    .upsert({ ...key, ...completion }, { onConflict: 'user_id,activity_id', ignoreDuplicates: true })
    .select('activity_id');
  if (error) throw new Error(`progress insert: ${error.message}`);
  if ((data ?? []).length > 0) return;
  const { error: updateError } = await db
    .from('progress')
    .update(completion)
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .neq('status', 'completed');
  if (updateError) throw new Error(`progress update: ${updateError.message}`);
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await readJsonObject(request, MAX_BODY_BYTES);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const { activity_id: activityId, passed: claimedPassed, response = null, answer = null } = body;
    if (typeof activityId !== 'string' || !isUuid(activityId) || typeof claimedPassed !== 'boolean') {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (response !== null && (typeof response !== 'string' || response.length > MAX_RESPONSE_CHARS)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (canonicalJson(answer).length > MAX_ANSWER_CHARS) return json({ error: 'invalid_body' }, 400, cors);

    const token = bearerToken(request);
    if (!token) return json({ error: 'unauthorized' }, 401, cors);
    const db = serviceClient();
    const [userId, activity] = await Promise.all([iteraUserOf(db, token), loadActivityAs(token, activityId)]);
    if (userId === 'unauthorized') return json({ error: 'unauthorized' }, 401, cors);
    if (userId === 'no_itera_profile') return json({ error: 'no_itera_profile' }, 403, cors);
    if (!activity) return json({ error: 'activity_not_found' }, 404, cors);

    if ((await recentAttempts(db, userId)) >= MAX_ATTEMPTS_PER_MINUTE) {
      return json({ error: 'too_many_attempts', retryable: true }, 429, cors);
    }

    const grade = gradeSubmission(activity.kind, activity.spec, { answer, response }, claimedPassed, parseHtmlDocument);
    const answerHash = sha256Hex(`${activity.id}\n${canonicalJson({ answer, response })}`);
    const { data: attempt, error } = await db
      .from('graded_attempts')
      .insert({
        user_id: userId,
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
      })
      .select('id,created_at')
      .single();
    if (error) throw new Error(`graded_attempts: ${error.message}`);

    await recordProgress(db, userId, activity.id, grade.passed);

    return json(
      {
        verdict: grade.passed ? 'pass' : 'fail',
        mode: grade.mode,
        ...(grade.reason ? { reason: grade.reason } : {}),
        attempt_id: attempt.id,
        answer_hash: answerHash,
        graded_at: attempt.created_at,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('grade failed', error);
    return json({ error: 'internal_error', retryable: true }, 500, cors);
  }
});
