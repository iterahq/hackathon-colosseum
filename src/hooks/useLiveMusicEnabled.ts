import { useSyncExternalStore } from 'react';

const KEY = 'itera.live.music';
const listeners = new Set<() => void>();

// Default ON: the gamified soundtrack is part of the live-class vibe, opt-out.
function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

function write(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — keep the in-tab default */
  }
  listeners.forEach((l) => l());
}

/**
 * Shared live-class background-music preference (persisted). Separate from the
 * mute gate: muting silences everything, this switches just the soundtrack.
 */
export function useLiveMusicEnabled(): [boolean, () => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true
  );
  return [on, () => write(!read())];
}
