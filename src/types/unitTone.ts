/** A unit's 3-stop color ramp for the per-unit skill-tree palette. */
export interface UnitTone {
  /** Solid fill — a `done` node, and the unit rail/badge border. */
  base: string;
  /** Text/icon color over `soft` or the dark background. */
  hi: string;
  /** Subtle background — a `current`/not-yet-done node. */
  soft: string;
  /** Text/icon color over `base` (a filled `done` node). */
  onBase: string;
}
