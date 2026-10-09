/**
 * mediaHoverPreference — whether hovering a lesson image opens the big
 * preview. One switch for the learner, not one per image: flipping it on any
 * figure updates every figure on screen, and it survives a reload through the
 * host's storage port.
 *
 * It is OFF until the learner turns it on. The key predates that default and
 * only ever stored 'off' (on was "no key"), so an old 'off' still reads as off,
 * and an old "never chose" and "chose on" are the same absent key: both read off.
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
      cached = storage.read(MEDIA_HOVER_PREFERENCE_KEY) === 'on';
    } catch {
      cached = false;
    }
  }
  return cached;
}

export function writeMediaHoverPreference(storage: ActivityStoragePort, enabled: boolean): void {
  cached = enabled;
  try {
    storage.write(MEDIA_HOVER_PREFERENCE_KEY, enabled ? 'on' : 'off');
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

export const MEDIA_HOVER_COACH_KEY = 'itera.activities.mediaHoverCoachSeen';

export function readMediaHoverCoachSeen(storage: ActivityStoragePort): boolean {
  try {
    return storage.read(MEDIA_HOVER_COACH_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMediaHoverCoachSeen(storage: ActivityStoragePort): void {
  try {
    storage.write(MEDIA_HOVER_COACH_KEY, '1');
  } catch {
    /* a flag that does not survive the reload only shows the balloon once more */
  }
}

/** One balloon on screen at a time, however many images the screen has. */
let coachOwner: symbol | null = null;

export function claimMediaHoverCoach(owner: symbol): boolean {
  if (coachOwner !== null && coachOwner !== owner) return false;
  coachOwner = owner;
  return true;
}

export function releaseMediaHoverCoach(owner: symbol): void {
  if (coachOwner === owner) coachOwner = null;
}
