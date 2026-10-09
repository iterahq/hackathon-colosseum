import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { TIME_ZONE, changeLives, companionResponse, ensureCompanion, inBackground, loadStats, syncMirror } from '../_shared/companion-store.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { grantLife, lessonBonus, lessonBonusAttemptId, loseLife, regenerate, type LessonBonus } from '../_shared/lives.ts';
import { localParts } from '../_shared/awards.ts';

const MAX_MISTAKES = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Records the event once per (learner, attempt id). False when it was already there. */
async function recordOnce(db: IteraClient, event: { user_id: string; attempt_id: string; kind: string; activity_id?: string }): Promise<boolean> {
  const { data, error } = await db
    .from('life_events')
    .upsert({ ...event, applied_at: new Date().toISOString() }, { onConflict: 'user_id,attempt_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`life_events: ${error.message}`);
  return (data ?? []).length > 0;
}

async function forget(db: IteraClient, userId: string, attemptId: string): Promise<void> {
  await db.from('life_events').delete().eq('user_id', userId).eq('attempt_id', attemptId);
}

/** A change that must happen exactly once: the event row is the lock, dropped again if the change fails. */
async function once(db: IteraClient, userId: string, attemptId: string, kind: string, activityId: string | undefined, change: () => Promise<unknown>): Promise<boolean> {
  if (!(await recordOnce(db, { user_id: userId, attempt_id: attemptId, kind, activity_id: activityId }))) return false;
  try {
    await change();
    return true;
  } catch (error) {
    await forget(db, userId, attemptId);
    throw error;
  }
}

/** What the server knows about the lesson: is it fully completed, and did it cost lives today. */
async function lessonFacts(db: IteraClient, userId: string, lessonId: string, now: Date) {
  const { data: activities, error } = await db.from('activities').select('id').eq('lesson_id', lessonId).eq('status', 'published');
  if (error) throw new Error(`activities: ${error.message}`);
  const ids = (activities ?? []).map((activity) => activity.id);
  if (ids.length === 0) return { lessonComplete: false, lossesToday: 0 };

  const today = localParts(now.toISOString(), TIME_ZONE).date;
  const [progress, losses] = await Promise.all([
    db.from('progress').select('activity_id').eq('user_id', userId).eq('status', 'completed').in('activity_id', ids),
    db
      .from('life_events')
      .select('created_at')
      .eq('user_id', userId)
      .eq('kind', 'lose')
      .in('activity_id', ids)
      .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString()),
  ]);
  if (progress.error) throw new Error(`progress: ${progress.error.message}`);
  if (losses.error) throw new Error(`life_events: ${losses.error.message}`);
  return {
    lessonComplete: new Set((progress.data ?? []).map((row) => row.activity_id)).size === ids.length,
    lossesToday: (losses.data ?? []).filter((row) => localParts(row.created_at, TIME_ZONE).date === today).length,
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const userId = caller.iteraUserId;
    let bonus: LessonBonus | undefined;

    if (body.action === 'lose') {
      const { attempt_id: attemptId, activity_id: activityId } = body;
      if (typeof attemptId !== 'string' || !/^[\w.:-]{1,120}$/.test(attemptId) || typeof activityId !== 'string' || !isUuid(activityId)) {
        return json({ error: 'invalid_body' }, 400, cors);
      }
      await once(db, userId, `lose:${attemptId}`, 'lose', activityId, () => changeLives(db, userId, loseLife));
    } else if (body.action === 'lesson_end') {
      const { lesson_id: lessonId, mistakes } = body;
      if (typeof lessonId !== 'string' || !isUuid(lessonId) || !Number.isInteger(mistakes) || (mistakes as number) < 0 || (mistakes as number) > MAX_MISTAKES) {
        return json({ error: 'invalid_body' }, 400, cors);
      }
      const now = new Date();
      const attemptId = lessonBonusAttemptId(lessonId.toLowerCase(), now, TIME_ZONE);
      const [row, facts, granted] = await Promise.all([
        ensureCompanion(db, userId),
        lessonFacts(db, userId, lessonId, now),
        db.from('life_events').select('id').eq('user_id', userId).eq('attempt_id', attemptId).maybeSingle(),
      ]);
      if (granted.error) throw new Error(`life_events: ${granted.error.message}`);
      const current = regenerate({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at }, now);
      bonus = lessonBonus({
        mistakes: Math.max(mistakes as number, facts.lossesToday),
        lessonComplete: facts.lessonComplete,
        alreadyGrantedToday: granted.data !== null,
        lives: current.lives,
        maxLives: current.maxLives,
      });
      if (bonus === 'granted' && !(await once(db, userId, attemptId, 'lesson_bonus', undefined, () => changeLives(db, userId, grantLife)))) {
        bonus = 'already_granted';
      }
      // The lesson end is one of the moments the asset catches up with the database.
      if (caller.wallet) inBackground(syncMirror(db, userId));
    } else {
      return json({ error: 'invalid_body' }, 400, cors);
    }

    const now = new Date();
    const [row, stats] = await Promise.all([ensureCompanion(db, userId), loadStats(db, userId, now)]);
    return json({ ...companionResponse(row, stats, now), ...(bonus ? { bonus } : {}) }, 200, cors);
  } catch (error) {
    console.error('lives failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
