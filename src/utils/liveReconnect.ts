const DELAYS_MS = [1000, 2000, 5000, 10000, 15000];

/** Backoff schedule for rebuilding a dropped live-class channel (caps at 15s). */
export function reconnectDelayMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 0), DELAYS_MS.length - 1);
  return DELAYS_MS[idx];
}
