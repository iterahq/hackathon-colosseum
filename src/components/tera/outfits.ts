/**
 * Tera's accessories as plain SVG shapes, drawn in the coordinate space of his face art
 * (240 x 368, the same box as `guideFaces`): the ring is a circle centred at (120, 248), r 118,
 * his near eye sits at (100, 258) and the far one at (198, 254). Nothing here redraws Tera.
 *
 * The look follows the on-chain art (`supabase/functions/_shared/art.ts`, `OUTFIT_ART`): cream
 * wire glasses, a cream band with dark cups and a green slot, a gold-leaf crown with a green gem.
 * That art uses another crop of the face (240 x 300), so the numbers differ and the design is the same.
 * No imports, so either side can copy the other.
 */
export const OUTFIT_VIEW_BOX = '0 0 240 368';
export const OUTFIT_BOX = { width: 240, height: 368 } as const;
/** The dark halo drawn around every accessory so it reads on any face: 2px, thinner on small faces. */
export const OUTFIT_OUTLINE = '#0A0908';

export type OutfitKey = 'outfit_glasses' | 'outfit_crown' | 'outfit_headphones';

export interface OutfitShape {
  d: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  /** In box units (the box is 240 wide). */
  strokeWidth?: number;
  strokeOpacity?: number;
  transform?: string;
}

export const OUTFIT_KEYS: readonly OutfitKey[] = ['outfit_glasses', 'outfit_headphones', 'outfit_crown'];

const CROWN_TILT = 'rotate(-9 144.8 137.6)';

export const OUTFITS: Record<OutfitKey, readonly OutfitShape[]> = {
  outfit_glasses: [
    // two lenses, the bridge, the two temple arms, a glint
    { d: 'M69 258a31 31 0 1 0 62 0a31 31 0 1 0 -62 0Z', fill: '#0A0908', fillOpacity: 0.3, stroke: '#F4EDE2', strokeWidth: 7 },
    { d: 'M170 255a28 28 0 1 0 56 0a28 28 0 1 0 -56 0Z', fill: '#0A0908', fillOpacity: 0.3, stroke: '#F4EDE2', strokeWidth: 7 },
    { d: 'M131 255q19 -11 39 2', stroke: '#F4EDE2', strokeWidth: 7 },
    { d: 'M69 251l-40 -16', stroke: '#F4EDE2', strokeWidth: 7 },
    { d: 'M226 251l10 -3', stroke: '#F4EDE2', strokeWidth: 7 },
    { d: 'M82 245q10 -12 25 -10', stroke: '#F4EDE2', strokeWidth: 4, strokeOpacity: 0.6 },
  ],
  outfit_headphones: [
    // the band over the head with its seam, the two cups, their green slots
    { d: 'M28 240C20 108 232 102 226 232', stroke: '#F4EDE2', strokeWidth: 12 },
    { d: 'M28 240C20 108 232 102 226 232', stroke: '#0A0908', strokeWidth: 4, strokeOpacity: 0.35 },
    { d: 'M25 214h4a19 19 0 0 1 19 19v36a19 19 0 0 1 -19 19h-4a19 19 0 0 1 -19 -19v-36a19 19 0 0 1 19 -19Z', fill: '#141210', stroke: '#F4EDE2', strokeWidth: 5 },
    { d: 'M219 206h2a17 17 0 0 1 17 17v36a17 17 0 0 1 -17 17h-2a17 17 0 0 1 -17 -17v-36a17 17 0 0 1 17 -17Z', fill: '#141210', stroke: '#F4EDE2', strokeWidth: 5 },
    { d: 'M27 234h0a7 7 0 0 1 7 7v20a7 7 0 0 1 -7 7h0a7 7 0 0 1 -7 -7v-20a7 7 0 0 1 7 -7Z', fill: '#3FD17F' },
    { d: 'M220 224h0a7 7 0 0 1 7 7v20a7 7 0 0 1 -7 7h0a7 7 0 0 1 -7 -7v-20a7 7 0 0 1 7 -7Z', fill: '#3FD17F' },
  ],
  outfit_crown: [
    // tilted on the brow in front of the crest: body, band, the gem and two studs, three pearls
    { d: 'M80.4 165.6 L69.2 92.8 L111.2 129.2 L144.8 73.2 L178.4 129.2 L220.4 92.8 L209.2 165.6 Z', fill: '#F2C66D', stroke: '#B8913A', strokeWidth: 4, transform: CROWN_TILT },
    { d: 'M84.6 160h120.4a7 7 0 0 1 7 7v5.6a7 7 0 0 1 -7 7h-120.4a7 7 0 0 1 -7 -7v-5.6a7 7 0 0 1 7 -7Z', fill: '#F2C66D', stroke: '#B8913A', strokeWidth: 4, transform: CROWN_TILT },
    { d: 'M138.8 169.8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z', fill: '#3FD17F', transform: CROWN_TILT },
    { d: 'M101.6 169.8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#F4EDE2', transform: CROWN_TILT },
    { d: 'M180 169.8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#F4EDE2', transform: CROWN_TILT },
    { d: 'M62.2 92.8a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z', fill: '#FBE7A8', transform: CROWN_TILT },
    { d: 'M137.8 73.2a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z', fill: '#FBE7A8', transform: CROWN_TILT },
    { d: 'M213.4 92.8a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z', fill: '#FBE7A8', transform: CROWN_TILT },
  ],
};

const ALIASES: Record<string, OutfitKey> = { glasses: 'outfit_glasses', crown: 'outfit_crown', headphones: 'outfit_headphones' };

/** The drawable outfit behind an item key or a bare name; null for none, unknown or non-outfit keys. */
export function outfitOf(key: string | null | undefined): OutfitKey | null {
  if (!key) return null;
  const k = key.trim().toLowerCase();
  if (k in OUTFITS) return k as OutfitKey;
  return ALIASES[k] ?? null;
}

/** What Tera wears on a surface: a previewed outfit wins over the equipped one; `null` preview means "take it off". */
export function selectOutfit(equipped: string | null | undefined, preview?: string | null): OutfitKey | null {
  return preview === undefined ? outfitOf(equipped) : outfitOf(preview);
}
