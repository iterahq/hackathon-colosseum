import type { DayState } from '@/types/trailDashboard';
import { trailPath } from '@/utils/trailPath';

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
  const states: DayState[] = Array.from({ length: n }, (_, i) => (i < done ? 'done' : i === done ? 'current' : 'upcoming'));
  const { nodes } = trailPath(states, { ...SLOT_AREA, r });
  return nodes.map((node, i) => ({
    cx: n === 1 ? SLOT_AREA.W / 2 : node.cx,
    cy: n === 1 ? SLOT_AREA.H / 2 : node.cy,
    r,
    day: i + 1,
    filled: i < done,
    next: i === done,
  }));
}
