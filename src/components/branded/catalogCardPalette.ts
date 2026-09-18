/**
 * Category palette for the v3 catalog card (`CatalogProgramCard`), promoted
 * from the designer's playground (`design-playground` PR #495,
 * `CatalogPageLab.stories.tsx`, `PALETTE_V3`).
 *
 * Each category is a rampa of THREE stops from the DFL Brand System:
 *   - `accent`: the categorical accent used for avatars (teal, blue, lilac,
 *     coral, amber). Paints the icon tile and the course title.
 *   - `surface`: the 900 stop, for dark surfaces. Paints the thumbnail band.
 *   - `edge`: the 700 stop. Draws the thumbnail's border.
 *
 * Blue and amber have a published ramp and enter literal; teal, lilac and
 * coral only have the accent published, so their 900/700 stops were derived
 * at the average luminosity/chroma of the published 900/700 stops
 * (OKLCH L 0.32/C 0.065 and L 0.52/C 0.11) at each accent's hue.
 *
 * Two brand rules are intentionally bent here (kept as the designer
 * specified, not "fixed"):
 *   - DFL guide 5.1/5.5: the member-* palette is PERSON identity and "never
 *     becomes UI" — this card uses five of those hues anyway (v2 already did);
 *   - Itera guide 3.2: DFL amber "never enters a pure Itera surface"; and
 *     coral is the literal hex of DFL's `danger` red.
 * Left out on purpose: amber only in "by DFL" pieces (contradicted above,
 * kept anyway per the designer's sign-off), mint (too close to
 * evergreen-hi), green-500 (generic status) and clay (Q&A-only).
 */
import type { CategoryTone } from '@/types/categoryTone';

export type { CategoryTone };

const TEAL: CategoryTone = { accent: '#7AD6CD', surface: '#003B37', edge: '#057A72' };
const BLUE: CategoryTone = { accent: '#7AA2E0', surface: '#1A2B4C', edge: '#3B5C9C' };
const LILAC: CategoryTone = { accent: '#B58FE0', surface: '#3A294D', edge: '#79569D' };
const CORAL: CategoryTone = { accent: '#E07A7A', surface: '#4C1A1A', edge: '#9C3B3B' };
const AMBER: CategoryTone = { accent: '#E07A4A', surface: '#4D2818', edge: '#9E5230' };

/**
 * Keyed by the same category key as `categoryFor` (`ProgramIcon.tsx`) — the
 * program's `icon` field. Covers all ten keys of `ICON_CATEGORY`.
 */
export const PALETTE_V3: Record<string, CategoryTone> = {
  code: TEAL,
  shield: TEAL,
  book: TEAL,
  layers: BLUE,
  cloud: BLUE,
  cpu: LILAC,
  wand: CORAL,
  sparkles: CORAL,
  brain: CORAL,
  rocket: AMBER,
};

const DEFAULT_TONE = TEAL;

/** Tone for a program's `icon` key, falling back to the default (teal) tone. */
export function toneFor(icon?: string): CategoryTone {
  return PALETTE_V3[icon ?? ''] ?? DEFAULT_TONE;
}
