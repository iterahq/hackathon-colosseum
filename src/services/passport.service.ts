/** Calls the `passport` edge function: it awards what the learner's progress earned and mints what it can. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { DayIncomplete, PassportResult } from '@/types/achievements';

/** Carries the HTTP status of a failed call, so callers can tell "function missing / not allowed" from "try again". */
export class PassportCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
  }
}

function dayIncomplete(raw: unknown): DayIncomplete | null | undefined {
  if (raw === undefined) return undefined;
  const v = raw as Partial<DayIncomplete> | null;
  if (!v || typeof v.done !== 'number' || typeof v.total !== 'number') return null;
  return { lesson_id: String(v.lesson_id ?? ''), done: v.done, total: v.total };
}

/** `lessonId` is the lesson just finished: the answer then says whether that day is whole (`day_incomplete`). */
export async function callPassport(lang: string, lessonId?: string): Promise<PassportResult> {
  if (!isSupabaseConfigured) throw new PassportCallError('Supabase not configured.', null);
  const { data, error } = await getSupabase().functions.invoke('passport', { body: lessonId ? { lang, lesson_id: lessonId } : { lang } });
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
    day_incomplete: dayIncomplete(body.day_incomplete),
  };
}
