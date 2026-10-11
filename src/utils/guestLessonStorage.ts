/**
 * The visitor's answers to the public first lesson, in localStorage under one key that is NOT user-scoped:
 * there is no user yet. A sign-in reads them back and replays the passes through the normal, recorded
 * grading path; then the key is cleared.
 */
import { GUEST_ANSWERS_KEY } from '@/consts/guestLesson';
import type { GuestAnswer, GuestAnswers } from '@/types/guestLesson';

const MAX_RESPONSE_CHARS = 2000;

const store = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

export function readGuestAnswers(): GuestAnswers {
  try {
    const raw = store()?.getItem(GUEST_ANSWERS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: GuestAnswers = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<GuestAnswer> | null;
      if (!v || typeof v.correct !== 'boolean' || typeof v.settledAt !== 'number') continue;
      out[id] = {
        correct: v.correct,
        settledAt: v.settledAt,
        ...(typeof v.response === 'string' ? { response: v.response } : {}),
        ...(Array.isArray(v.actions) ? { actions: v.actions } : {}),
        ...(v.serverVerdict === 'pass' || v.serverVerdict === 'fail' ? { serverVerdict: v.serverVerdict } : {}),
        ...(v.receipt && typeof v.receipt.graded_at === 'string' && typeof v.receipt.sig === 'string' ? { receipt: { graded_at: v.receipt.graded_at, sig: v.receipt.sig } } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeGuestAnswer(activityId: string, answer: GuestAnswer): GuestAnswers {
  const all = readGuestAnswers();
  all[activityId] = { ...answer, ...(answer.response ? { response: answer.response.slice(0, MAX_RESPONSE_CHARS) } : {}) };
  try {
    store()?.setItem(GUEST_ANSWERS_KEY, JSON.stringify(all));
  } catch {
    /* a full or blocked storage loses the copy, not the screen */
  }
  return all;
}

export function forgetGuestAnswer(activityId: string): GuestAnswers {
  const all = readGuestAnswers();
  delete all[activityId];
  try {
    store()?.setItem(GUEST_ANSWERS_KEY, JSON.stringify(all));
  } catch {
    /* same as above */
  }
  return all;
}

export function clearGuestAnswers(): void {
  try {
    store()?.removeItem(GUEST_ANSWERS_KEY);
  } catch {
    /* same as above */
  }
}

/** The passes a sign-in should replay, oldest first. */
export function guestPassesToClaim(answers: GuestAnswers): Array<{ activityId: string; answer: GuestAnswer }> {
  return Object.entries(answers)
    .filter(([, a]) => a.correct)
    .sort(([, a], [, b]) => a.settledAt - b.settledAt)
    .map(([activityId, answer]) => ({ activityId, answer }));
}
