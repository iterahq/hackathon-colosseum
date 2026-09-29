/**
 * Per-unit palette for the course-path skill tree (`SkillTree.tsx`), promoted
 * from the designer's playground (`design-playground/CoursePathColorLab.stories.tsx`,
 * "per unit" strategy — the Duolingo model). Each unit in a program gets its
 * own color from a 3-stop cycle, so the eye separates "which section" without
 * reading the title.
 *
 * Same three-stop shape as `catalogCardPalette.ts`'s `CategoryTone`
 * (`base`/`hi`/`soft` + the text-on-fill color), reused rather than duplicated:
 *   - `base`: solid fill for a `done` node and the unit rail/badge border.
 *   - `hi`: text/icon color on top of `soft` or the dark background.
 *   - `soft`: subtle background for a `current`/not-yet-done node.
 *   - `onBase`: text/icon color on top of `base` (a filled `done` node).
 *
 * Colors are applied via inline `style`, not Tailwind classes, for the same
 * reason the lab gives: a class built at runtime (`bg-[${hex}]`) does not
 * survive Tailwind's static extraction.
 */
import type { UnitTone } from '@/types/unitTone';

export type { UnitTone };

const EVERGREEN: UnitTone = { base: '#3FD17F', hi: '#62D996', soft: '#1C3A2A', onBase: '#0A0908' };
const BLUE: UnitTone = { base: '#0066FF', hi: '#6AA5FF', soft: '#13233F', onBase: '#FFFFFF' };
const TERRACOTTA: UnitTone = { base: '#E07A4A', hi: '#F0A278', soft: '#3A2318', onBase: '#0A0908' };

export const UNIT_PALETTE: UnitTone[] = [EVERGREEN, BLUE, TERRACOTTA];

/** Tone for a unit by its `ordinal`/index in the program, cycling every 3 units. */
export function toneForUnit(unitIndex: number): UnitTone {
  return UNIT_PALETTE[unitIndex % UNIT_PALETTE.length];
}

/** Darkens a 6-digit hex color by `percent` (0-100), for the solid bottom edge of pressable surfaces. */
export function darken(hex: string, percent: number): string {
  const factor = 1 - percent / 100;
  const channel = (start: number) =>
    Math.round(parseInt(hex.slice(start, start + 2), 16) * factor)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
