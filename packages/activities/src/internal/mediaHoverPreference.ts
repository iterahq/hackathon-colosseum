/**
 * mediaHoverPreference — whether hovering a lesson image opens the big
 * preview. One switch for the learner, not one per image: flipping it on any
 * figure updates every figure on screen, and it survives a reload through the
 * host's storage port.
 */
import type { ActivityStoragePort } from '../ports.js';

export const MEDIA_HOVER_PREFERENCE_KEY = 'itera.activities.mediaHoverPreview';

const listeners = new Set<() => void>();
let cached: boolean | null = null;

const notify = () => {
  for (const listener of listeners) listener();
};

export function readMediaHoverPreference(storage: ActivityStoragePort): boolean {
  if (cached === null) {
    try {
      cached = storage.read(MEDIA_HOVER_PREFERENCE_KEY) !== 'off';
    } catch {
      cached = true;
    }
  }
  return cached;
}

export function writeMediaHoverPreference(storage: ActivityStoragePort, enabled: boolean): void {
  cached = enabled;
  try {
    if (enabled) storage.clear(MEDIA_HOVER_PREFERENCE_KEY);
    else storage.write(MEDIA_HOVER_PREFERENCE_KEY, 'off');
  } catch {
    /* a preference that does not survive the reload is not worth an exception */
  }
  notify();
}

export function subscribeMediaHoverPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget the cached value — another tab wrote, or a test starts over. */
export function resetMediaHoverPreference(): void {
  cached = null;
  notify();
}
