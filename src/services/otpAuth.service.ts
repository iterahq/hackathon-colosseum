import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// shouldCreateUser: false keeps this passwordless flow inside the same access
// policy as the rest of auth — signing IN never mints an account, so a typo in
// the email is a failed login and not a second, empty account. Creating one is
// the explicit /signup surface below.
export async function sendLoginCode(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
  return { error: error?.message ?? null };
}

export async function verifyLoginCode(
  email: string,
  token: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await getSupabase().auth.verifyOtp({ email, token, type: 'email' });
  return { error: error?.message ?? null };
}

/**
 * Self-serve sign-up (PLG). The ONLY call in the app that may mint an account.
 *
 * Passwordless on purpose: the account is created by the same verified-email
 * round-trip that proves the address, so there is no unverified user sitting in
 * `auth.users` and no password to reset before the first lesson.
 *
 * Creating the account entitles NOTHING. The `auth.users` insert trigger
 * provisions a personal tenant (`plg-<uid>`), and both gates already refuse to
 * read that as access: `itera.my_subscription` excludes `plg-%` from the
 * exempt branch (migration 0075) and `membership.service` ignores personal
 * tenants when resolving admin affordances. A fresh account lands on the
 * paywall — that IS the product.
 *
 * An email that ALREADY has an account gets a normal magic link instead of a
 * new one; Supabase decides that server-side. The UI must therefore never say
 * "this email is taken" — same neutral copy as the login flow, or this becomes
 * an account-enumeration oracle.
 */
export async function sendSignupCode(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/subscribe` },
  });
  return { error: error?.message ?? null };
}

/**
 * Verify the sign-up code.
 *
 * Two token types can reach here for the same 6 digits: GoTrue mints a `signup`
 * confirmation for an address it has never seen and a `magiclink`/`email` one
 * for an address that already exists — and this surface cannot know which,
 * because it deliberately does not learn whether the account existed. So it
 * tries the generic `email` type and falls back to `signup` rather than
 * rejecting a code that is in fact valid.
 */
export async function verifySignupCode(
  email: string,
  token: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const supabase = getSupabase();
  const first = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (!first.error) return { error: null };
  const second = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  return { error: second.error?.message ?? null };
}
