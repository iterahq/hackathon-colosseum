/**
 * Debounced autosave of the learner's code-snack source. The snack has NO
 * grading in the MVP; a professor later "pulls" the latest snapshot to a stage
 * (a separate front). This reuses the SAME client-persistence convention as
 * `liveAnswerStorage` (per-activity, localStorage, survives refresh) rather than
 * inventing a new table or DB migration — `class_answers` carries no free-text
 * column, so the code text lives client-side and the answer ROW is recorded via
 * the existing `recordClassAnswer` path when the learner completes.
 *
 * Padrão do projeto: no React here — pure functions returning values.
 */
import type { CodeSnapshot } from '@/types/codeSnack';

export type { CodeSnapshot } from '@/types/codeSnack';

const keyFor = (activityId: string) => `itera.code.snapshot:${activityId}`;

/**
 * Fired on every autosave. The live session page listens so it can presence-track
 * "this learner has work in progress" — a DOM event keeps the signal decoupled
 * (no callback threaded through ActivityRenderer just to reach the live layer).
 */
export const CODE_SNAPSHOT_EVENT = 'itera:code-snapshot-saved';

export function readCodeSnapshot(activityId: string): CodeSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(activityId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && typeof (parsed as CodeSnapshot).code === 'string') {
      return parsed as CodeSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCodeSnapshot(activityId: string, code: string): void {
  if (!activityId) return;
  try {
    const snapshot: CodeSnapshot = { code, savedAt: new Date().toISOString() };
    localStorage.setItem(keyFor(activityId), JSON.stringify(snapshot));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CODE_SNAPSHOT_EVENT, { detail: { activityId } }));
    }
  } catch {
    // Storage unavailable (private mode/quota) — autosave degrades only.
  }
}
