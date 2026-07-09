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
import { getIteraUserId } from '@/services/iteraUser';
import type { Locale } from '@/i18n';

export interface MyProfile {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  /** The user's saved language preference (itera.users.locale). Default 'pt'. */
  locale: Locale | null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Coerce an arbitrary stored locale to the supported set (default pt). */
function toLocale(v: unknown): Locale | null {
  return v === 'en' ? 'en' : v === 'pt' ? 'pt' : null;
}

/**
 * The current user's Itera profile (own row only, per RLS). Null when not
 * configured / not signed in / no row yet. NEVER throws on a missing row —
 * returns null so the header degrades to email-derived initials.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  if (!isSupabaseConfigured) return null;
  // The row PK is NOT the auth uid, and the users SELECT policy returns more than
  // the caller's row (roster visibility), so an unscoped maybeSingle() errors on
  // multiple rows. Resolve the Itera user id and scope the read to it.
  const iteraUserId = await getIteraUserId();
  if (!iteraUserId) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users')
    .select('display_name, avatar_url, email, locale')
    .eq('id', iteraUserId)
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
    locale: toLocale(row.locale),
  };
}

/**
 * Persist the user's language preference to their Itera profile
 * (itera.users.locale). Self-update is allowed by RLS `users_update_self`
 * (id = itera.current_itera_user_id()). Resolves the Itera user id first (the
 * row PK is NOT the auth uid) and scopes the UPDATE to it. Returns true on a
 * confirmed write; false when not configured / not resolvable / RLS-blocked —
 * the caller keeps the localStorage fallback either way (never hard-fails the UI).
 */
export async function updateMyLocale(locale: Locale): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const iteraUserId = await getIteraUserId();
  if (!iteraUserId) return false;
  const sb = getSupabase();
  const { error } = await sb.from('users').update({ locale }).eq('id', iteraUserId);
  return !error;
}
