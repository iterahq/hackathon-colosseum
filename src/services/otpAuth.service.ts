import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// shouldCreateUser: false keeps this passwordless flow inside the same access
// policy as the rest of auth — sign-up is removed; only existing subscribers /
// DFL members get in. A stranger's email never mints a new account.
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
