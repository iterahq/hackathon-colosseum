/**
 * Debounced autosave of the learner's code-snack source, and the read side that
 * gives that work back to the learner. This reuses the SAME client-persistence
 * convention as `liveAnswerStorage` (per-activity, localStorage, survives
 * refresh) rather than inventing a new table or DB migration — `class_answers`
 * carries no free-text column, so the code text lives client-side and the answer
 * ROW is recorded via the existing `recordClassAnswer` path on completion.
 *
 * TWO readers, and for a long time only one of them existed:
 *   • the PROFESSOR pulls the snapshot to the class stage (`stageAnswerContent`);
 *   • the LEARNER gets their own work back when the page reloads
 *     (`useCodeSnack` seeds the editor from here).
 * The second one is the whole point of saving: a refresh, a dropped connection
 * or a restored tab mid-class used to send the learner back to the starter.
 *
 * Padrão do projeto: no React here — pure functions returning values.
 */
import type { CodeSnapshot } from '@/types/codeSnack';

export type { CodeSnapshot } from '@/types/codeSnack';

const keyFor = (activityId: string) => `itera.code.snapshot:${activityId}`;

/**
 * Fired on every autosave AND on every clear. The live session page listens so it
 * can presence-track "this learner has work in progress" — a DOM event keeps the
 * signal decoupled (no callback threaded through ActivityRenderer just to reach
 * the live layer). Clearing fires it too so the professor's picker walks back to
 * "ainda não começou" instead of advertising work that no longer exists.
 */
export const CODE_SNAPSHOT_EVENT = 'itera:code-snapshot-saved';

export function readCodeSnapshot(activityId: string): CodeSnapshot | null {
  if (!activityId) return null;
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

/**
 * Drop the saved work for one activity. Used by "Recomeçar do código inicial":
 * without it the next reload would resurrect exactly what the learner just chose
 * to throw away — the restore we added would work against them.
 */
export function clearCodeSnapshot(activityId: string): void {
  if (!activityId) return;
  try {
    localStorage.removeItem(keyFor(activityId));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CODE_SNAPSHOT_EVENT, { detail: { activityId } }));
    }
  } catch {
    // Storage unavailable — there is nothing persisted to clear either.
  }
}
