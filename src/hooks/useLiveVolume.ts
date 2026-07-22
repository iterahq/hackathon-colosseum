import { useSyncExternalStore } from 'react';

const KEY = 'itera.live.volume';
const listeners = new Set<() => void>();

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const DEFAULT_VOLUME = 0.1;

function read(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? clamp(v) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function write(v: number): void {
  const value = clamp(v);
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* storage unavailable — keep the in-tab default */
  }
  listeners.forEach((l) => l());
}

/**
 * Shared live-class sound VOLUME (0–1, persisted). Scales every live cue and is
 * driven by the header's hover slider. Separate from the mute preference: mute
 * is the on/off gate, volume is the level.
 */
export function useLiveVolume(): [number, (v: number) => void] {
  const volume = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT_VOLUME
  );
  return [volume, write];
}
