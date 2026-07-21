import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  });
  return { error: error?.message ?? null };
}

export async function updatePassword(password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await getSupabase().auth.updateUser({ password });
  return { error: error?.message ?? null };
}
