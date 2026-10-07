import { scopedKey } from '@/utils/storageScope';
import { belongsToExecution, currentExecutionId } from '@/utils/activityExecution';

const keyFor = (activityId: string) => scopedKey('itera.text.draft', activityId);

/** The free-text answer a learner was writing in an activity, or `null`. */
export function readTextDraft(activityId: string): string | null {
  if (!activityId) return null;
  const key = keyFor(activityId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const envelope = parsed as { text?: string; execution?: string | null };
    if (typeof envelope.text !== 'string') return null;
    if (!belongsToExecution(envelope.execution, currentExecutionId())) return null;
    return envelope.text;
  } catch {
    return null;
  }
}

export function saveTextDraft(activityId: string, text: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ text, savedAt: new Date().toISOString(), execution: currentExecutionId() }),
    );
  } catch {
    // Storage unavailable (private mode/quota) — the draft lives in this tab only.
  }
}

export function clearTextDraft(activityId: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing was persisted to clear either.
  }
}
