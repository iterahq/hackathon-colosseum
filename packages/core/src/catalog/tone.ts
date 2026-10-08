import type { CatalogCardTone } from '../ports/catalog';

const TEAL: CatalogCardTone = { accent: '#7AD6CD', surface: '#003B37', edge: '#057A72' };
const BLUE: CatalogCardTone = { accent: '#7AA2E0', surface: '#1A2B4C', edge: '#3B5C9C' };
const LILAC: CatalogCardTone = { accent: '#B58FE0', surface: '#3A294D', edge: '#79569D' };
const CORAL: CatalogCardTone = { accent: '#E07A7A', surface: '#4C1A1A', edge: '#9C3B3B' };
const AMBER: CatalogCardTone = { accent: '#E07A4A', surface: '#4D2818', edge: '#9E5230' };

/** The category palette of the catalog card, by the program's `icon` key. Why these hues: `src/components/branded/catalogCardPalette.ts`. */
export const PALETTE_V3: Record<string, CatalogCardTone> = {
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

/** Tone for a program's `icon` key, falling back to teal. */
export function toneFor(icon?: string): CatalogCardTone {
  return PALETTE_V3[icon ?? ''] ?? TEAL;
}
