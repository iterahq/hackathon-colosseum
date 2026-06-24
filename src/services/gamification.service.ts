/**
 * Gamification writes (data layer — no React here).
 *
 * awardActivityXp — grant XP for completing an activity, idempotently. Delegates
 * to the SECURITY DEFINER RPC itera.award_activity_xp (migration 0008), which:
 *   - resolves the caller's Itera-local user id + the activity's tenant,
 *   - inserts ONE xp_events row tagged reason='activity_complete:<activity_id>',
 *   - is a no-op on re-completion (partial unique index + ON CONFLICT DO NOTHING).
 *
 * Returns the XP actually awarded (0 when already awarded / not entitled / no
 * session). Best-effort: errors are swallowed so the learner UX never blocks.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { XP_PER_ACTIVITY } from '@/config/gamification';

export async function awardActivityXp(
  activityId: string,
  amount: number = XP_PER_ACTIVITY
): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const sb = getSupabase();
    // db.schema='itera' is applied to .rpc() too -> itera.award_activity_xp.
    const { data, error } = await sb.rpc('award_activity_xp', {
      p_activity_id: activityId,
      p_amount: amount,
    });
    if (error) return 0;
    return typeof data === 'number' ? data : 0;
  } catch {
    return 0;
  }
}
