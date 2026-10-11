import { localParts } from './awards.ts';
import { TIME_ZONE, changeLives, ensureCompanion, livesOf } from './companion-store.ts';
import type { IteraClient } from './db.ts';
import { LESSON_MISS_CAP, livesView, loseLife, missAttemptId, missCharge, regenerate, type LivesView, type MissCharge } from './lives.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MissOutcome {
  /** Why this miss did or did not cost a life. */
  charge: MissCharge;
  /** False when the charge was due but took nothing (the infinite pack, or no lives left). */
  life_lost: boolean;
  lesson_cap: number;
  lives: LivesView;
}

/**
 * A miss the server graded: costs one life, once per activity per local day and
 * at most `LESSON_MISS_CAP` per lesson per local day. The event row is the lock,
 * so two answers of the same activity arriving together charge once.
 */
export async function chargeMiss(db: IteraClient, userId: string, activity: { id: string; lesson_id: string }): Promise<MissOutcome> {
  const now = new Date();
  const today = localParts(now.toISOString(), TIME_ZONE).date;
  const { data: siblings, error: siblingsError } = await db.from('activities').select('id').eq('lesson_id', activity.lesson_id);
  if (siblingsError) throw new Error(`activities: ${siblingsError.message}`);
  const ids = (siblings ?? []).map((row) => row.id as string);
  const { data: losses, error: lossesError } = await db
    .from('life_events')
    .select('activity_id,created_at')
    .eq('user_id', userId)
    .eq('kind', 'lose')
    .in('activity_id', ids.length > 0 ? ids : [activity.id])
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString());
  if (lossesError) throw new Error(`life_events: ${lossesError.message}`);
  const todays = (losses ?? []).filter((row) => localParts(row.created_at as string, TIME_ZONE).date === today);
  let charge = missCharge({
    chargedForActivityToday: todays.some((row) => row.activity_id === activity.id),
    lessonLossesToday: todays.length,
  });

  let lifeLost = false;
  if (charge === 'charged') {
    const attemptId = missAttemptId(activity.id, now, TIME_ZONE);
    const { data: inserted, error } = await db
      .from('life_events')
      .upsert({ user_id: userId, attempt_id: attemptId, kind: 'lose', activity_id: activity.id, applied_at: now.toISOString() }, { onConflict: 'user_id,attempt_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`life_events: ${error.message}`);
    if ((inserted ?? []).length === 0) {
      charge = 'already_charged';
    } else {
      try {
        await changeLives(db, userId, (state, at) => {
          const next = loseLife(state, at);
          lifeLost = next.lives < regenerate(state, at).lives;
          return next;
        });
      } catch (failure) {
        await db.from('life_events').delete().eq('user_id', userId).eq('attempt_id', attemptId);
        throw failure;
      }
    }
  }

  const row = await ensureCompanion(db, userId);
  return { charge, life_lost: lifeLost, lesson_cap: LESSON_MISS_CAP, lives: livesView(livesOf(row), new Date()) };
}
