export const SLOT_AREA = { W: 250, H: 120, A: 14 } as const;

export interface Slot {
  cx: number;
  cy: number;
  r: number;
  day: number;
  filled: boolean;
  /** The first empty slot: where the next stamp lands. */
  next: boolean;
}

/** Positions of the stamp slots of a page: the dashboard zig-zag, shrunk when a trail has many days. */
export function passportSlots(total: number, done: number): Slot[] {
  const n = Math.max(1, total);
  const r = n <= 5 ? 26 : Math.max(9, Math.floor((26 * 5) / n));
  const amp = Math.min(30, SLOT_AREA.H / 2 - r - 4);
  return Array.from({ length: n }, (_, i) => ({
    cx: n === 1 ? SLOT_AREA.W / 2 : r + 8 + i * ((SLOT_AREA.W - 2 * r - 16) / (n - 1)),
    cy: SLOT_AREA.H / 2 + (n === 1 ? 0 : i % 2 ? amp : -amp),
    r,
    day: i + 1,
    filled: i < done,
    next: i === done,
  }));
}
