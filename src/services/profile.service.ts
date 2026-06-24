/**
 * Itera self-profile data layer.
 *
 * Resolves the signed-in user's Itera-local profile (display_name + avatar_url)
 * from itera.users. RLS `users_select_self` (id = itera.current_itera_user_id())
 * lets a user read their OWN row only. These fields are mirrored from DFL on
 * federated login by the itera-api /v1/embed/session route (name + avatar pulled
 * from DFL public.profiles), so the player shows the fellow's DFL identity.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React here.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface MyProfile {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * The current user's Itera profile (own row only, per RLS). Null when not
 * configured / not signed in / no row yet. NEVER throws on a missing row —
 * returns null so the header degrades to email-derived initials.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users')
    .select('display_name, avatar_url, email')
    .maybeSingle();
  if (error) {
    // Don't hard-fail the header on a transient/RLS read issue.
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    displayName: str(row.display_name),
    avatarUrl: str(row.avatar_url),
    email: str(row.email),
  };
}
