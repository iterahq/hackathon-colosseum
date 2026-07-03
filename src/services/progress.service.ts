/**
 * Shared activity-completion persistence.
 *
 * Extracted from LessonPlayer so BOTH the solo lesson player and the live-class
 * session page write completion the EXACT same way (per-user, RLS-scoped) — the
 * live mode only changes WHICH activity is on screen, never how results persist.
 *
 * Writes itera.progress (load-bearing: drives lesson-done / unlock) + best-effort
 * itera.activity_results (+ XP). RLS keys these on itera.users.id (NOT the auth
 * uid) — resolve the Itera-local id first, else the FK silently fails.
 *
 * Returns TRUE only when the progress row actually landed, so callers never
 * celebrate an unsaved completion.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import { awardActivityXp } from '@/services/gamification.service';

export async function persistActivityProgress(activityId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const sb = getSupabase();
    const userId = await getIteraUserId();
    if (!userId) return false;

    // Progress: upsert with the CORRECT enum value ('completed' — NOT 'done').
    const { error: progressError } = await sb
      .from('progress')
      .upsert(
        {
          user_id: userId,
          activity_id: activityId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,activity_id' }
      );
    // The progress write is the load-bearing one; if it failed, report failure so
    // we never celebrate an unsaved completion.
    if (progressError) return false;

    // Results: best-effort insert (the per-tenant Results-API pull reads these).
    await sb
      .from('activity_results')
      .insert({ user_id: userId, activity_id: activityId, passed: true, score_internal: null });

    // XP: idempotent SECURITY DEFINER RPC (never double-awards). Best-effort.
    await awardActivityXp(activityId);
    return true;
  } catch {
    return false;
  }
}
