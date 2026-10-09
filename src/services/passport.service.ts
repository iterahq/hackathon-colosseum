/** Calls the `passport` edge function: it awards what the learner's progress earned and mints what it can. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { PassportResult } from '@/types/achievements';

/** Carries the HTTP status of a failed call, so callers can tell "function missing / not allowed" from "try again". */
export class PassportCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
  }
}

export async function callPassport(lang: string): Promise<PassportResult> {
  if (!isSupabaseConfigured) throw new PassportCallError('Supabase not configured.', null);
  const { data, error } = await getSupabase().functions.invoke('passport', { body: { lang } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new PassportCallError(error.message, typeof status === 'number' ? status : null);
  }
  const body = (data ?? {}) as Partial<PassportResult>;
  return {
    awards: Array.isArray(body.awards) ? body.awards : [],
    updated: Array.isArray(body.updated) ? body.updated : [],
    remaining: typeof body.remaining === 'number' ? body.remaining : 0,
    mint: body.mint,
  };
}
