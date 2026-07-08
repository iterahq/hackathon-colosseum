import { useSyncExternalStore } from 'react';

const KEY = 'itera.live.muted';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* storage unavailable — keep the in-tab default */
  }
  listeners.forEach((l) => l());
}

/**
 * Shared live-class mute preference (persisted to localStorage). All live
 * surfaces read the same value, so the sidebar toggle and the sound triggers
 * stay in sync across the page.
 */
export function useLiveMuted(): [boolean, () => void] {
  const muted = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false
  );
  return [muted, () => write(!read())];
}
