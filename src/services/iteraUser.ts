/**
 * Resolve the caller's ITERA-LOCAL user id (itera.users.id) for the signed-in
 * Supabase auth session.
 *
 * WHY this exists: itera.progress.user_id and itera.activity_results.user_id are
 * FKs to itera.users.id — NOT the Supabase auth uid. RLS resolves the link via
 * itera.current_itera_user_id() (identities.provider_subject = auth.uid()::text).
 * Writing the raw auth uid silently FK-fails. Resolve the Itera user id first.
 *
 * Strategy: call the SECURITY DEFINER RPC `current_itera_user_id` (granted to
 * authenticated). Fall back to selecting our own itera.users row (RLS allows
 * users_select_self). Returns null when not resolvable (no membership yet).
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { rememberStorageScope } from '@/utils/storageScope';

let _cached: string | null | undefined;

export async function getIteraUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  if (_cached !== undefined) return _cached;

  const sb = getSupabase();
  try {
    // Primary: the RLS helper RPC. db.schema='itera' is applied to .rpc() too.
    const { data, error } = await sb.rpc('current_itera_user_id');
    if (!error && typeof data === 'string' && data) {
      _cached = data;
      rememberStorageScope(data);
      return data;
    }
  } catch {
    /* fall through to the self-select fallback */
  }

  try {
    // Fallback. NOTE: RLS on itera.users is NOT "self only" — staff can read
    // every user in their tenant (an instructor sees ~22 rows). So a bare
    // `.limit(1)` here would happily return SOMEONE ELSE's id and silently
    // mis-attribute every downstream write. Only accept an unambiguous
    // single-row answer; anything else means "not resolvable this way".
    const { data } = await sb.from('users').select('id').limit(2);
    const rows = Array.isArray(data) ? (data as { id?: string }[]) : [];
    const id = rows.length === 1 ? (rows[0]?.id ?? null) : null;
    _cached = id;
    rememberStorageScope(id);
    return id;
  } catch {
    _cached = null;
    return null;
  }
}

/** Test/embed hook: clear the memoized id (e.g. after a session change). */
export function resetIteraUserIdCache(): void {
  _cached = undefined;
}
