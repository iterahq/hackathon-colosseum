/** Signed quick nudges (seconds) offered by the professor's time popover. */
export const QUICK_DELTA_SECONDS = [-60, -30, 30, 60] as const;

/** Short label for a quick chip: `−30s`, `+1min`. Uses a real minus sign. */
export function quickDeltaLabel(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(seconds);
  return abs < 60 ? `${sign}${abs}s` : `${sign}${Math.round(abs / 60)}min`;
}

/** Stable testid per chip — no bare `-60`, which reads as a stray dash. */
export function quickDeltaTestId(seconds: number): string {
  return `instructor-time-quick-${seconds < 0 ? 'minus' : 'plus'}-${Math.abs(seconds)}`;
}
