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
export async function callPassport(lang: string, lessonId?: string, maxJobs?: number): Promise<PassportResult> {
  if (!isSupabaseConfigured) throw new PassportCallError('Supabase not configured.', null);
  const body = { lang, ...(lessonId ? { lesson_id: lessonId } : {}), ...(maxJobs ? { max_jobs: maxJobs } : {}) };
  const { data, error } = await getSupabase().functions.invoke('passport', { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new PassportCallError(error.message, typeof status === 'number' ? status : null);
  }
  const answer = (data ?? {}) as Partial<PassportResult>;
  return {
    awards: Array.isArray(answer.awards) ? answer.awards : [],
    updated: Array.isArray(answer.updated) ? answer.updated : [],
    remaining: typeof answer.remaining === 'number' ? answer.remaining : 0,
    mint: answer.mint,
    day_incomplete: dayIncomplete(answer.day_incomplete),
  };
}
