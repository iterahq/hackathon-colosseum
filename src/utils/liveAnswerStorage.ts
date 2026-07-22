/**
 * Local persistence of the learner's OWN answers in a live session, so a page
 * refresh can't re-open an already-answered activity (re-answering re-fired the
 * broadcast and reset the professor's aggregates — 1st-class bug #5). Keyed per
 * session; localStorage so it survives refresh and accidental tab close.
 */
import type { StoredLiveAnswer } from '@/types/liveClass';

export type { StoredLiveAnswer } from '@/types/liveClass';

const keyFor = (sessionId: string) => `itera.live.answers:${sessionId}`;

function readAll(sessionId: string): Record<string, StoredLiveAnswer> {
  try {
    const raw = localStorage.getItem(keyFor(sessionId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredLiveAnswer>) : {};
  } catch {
    return {};
  }
}

export function readStoredAnswer(sessionId: string, activityId: string): StoredLiveAnswer | null {
  const entry = readAll(sessionId)[activityId];
  return entry && typeof entry.correct === 'boolean' ? entry : null;
}

export function storeAnswer(
  sessionId: string,
  activityId: string,
  answer: StoredLiveAnswer
): void {
  try {
    const all = readAll(sessionId);
    all[activityId] = answer;
    localStorage.setItem(keyFor(sessionId), JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode/quota) — refresh protection degrades only.
  }
}
