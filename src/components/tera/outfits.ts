/**
 * Tera's accessories as plain SVG shapes, drawn in the coordinate space of his face art
 * (240 x 368, the same box as `guideFaces`): the ring is a circle centred at (120, 248), r 118,
 * his near eye sits at (100, 258) and the far one at (198, 254). Nothing here redraws Tera.
 * The backend copies these shapes into its on-chain art, so this module has no imports.
 */
export const OUTFIT_VIEW_BOX = '0 0 240 368';
export const OUTFIT_BOX = { width: 240, height: 368 } as const;
export const OUTFIT_OUTLINE = '#0A0908';

export type OutfitKey = 'outfit_glasses' | 'outfit_crown' | 'outfit_headphones';

export interface OutfitShape {
  d: string;
  fill: string;
  /** Shapes are outlined in `OUTFIT_OUTLINE` unless this is false. */
  outline?: boolean;
  opacity?: number;
}

export const OUTFIT_KEYS: readonly OutfitKey[] = ['outfit_glasses', 'outfit_headphones', 'outfit_crown'];

export const OUTFITS: Record<OutfitKey, readonly OutfitShape[]> = {
  outfit_glasses: [
    // temple arm, then the bridge, then the two lenses and their glints
    { d: 'M66 250 L20 232 L18 242 L64 262 Z', fill: '#F4EDE2' },
    { d: 'M134 250 Q150 238 166 249 L166 259 Q150 249 134 260 Z', fill: '#F4EDE2' },
    { d: 'M100 222 a36 36 0 1 0 0.01 0 Z M100 232 a26 26 0 1 1 -0.01 0 Z', fill: '#F4EDE2' },
    { d: 'M198 220 a34 34 0 1 0 0.01 0 Z M198 230 a24 24 0 1 1 -0.01 0 Z', fill: '#F4EDE2' },
    { d: 'M100 232 a26 26 0 1 0 0.01 0 Z', fill: '#3FD17F', outline: false, opacity: 0.22 },
    { d: 'M198 230 a24 24 0 1 0 0.01 0 Z', fill: '#3FD17F', outline: false, opacity: 0.22 },
    { d: 'M84 244 L96 238 L90 250 Z', fill: '#F4EDE2', outline: false, opacity: 0.8 },
  ],
  outfit_headphones: [
    // band over the head, then the two cups and their pads
    { d: 'M22 236 C22 150 78 112 128 112 C182 112 224 152 226 226 L210 228 C206 164 172 130 128 130 C86 130 40 160 38 236 Z', fill: '#F4EDE2' },
    { d: 'M8 222 h26 a10 10 0 0 1 10 10 v52 a10 10 0 0 1 -10 10 h-26 a6 6 0 0 1 -6 -6 v-60 a6 6 0 0 1 6 -6 Z', fill: '#3FD17F' },
    { d: 'M206 212 h24 a6 6 0 0 1 6 6 v58 a6 6 0 0 1 -6 6 h-24 a10 10 0 0 1 -10 -10 v-50 a10 10 0 0 1 10 -10 Z', fill: '#3FD17F' },
    { d: 'M14 240 h10 v36 h-10 Z', fill: '#0A0908', outline: false, opacity: 0.35 },
    { d: 'M216 230 h10 v34 h-10 Z', fill: '#0A0908', outline: false, opacity: 0.35 },
  ],
  outfit_crown: [
    // tilted on the brow, in front of the crest: body, base band, three gems
    { d: 'M40 196 L30 134 L62 160 L84 116 L108 152 L140 118 L150 178 Z', fill: '#F2C66D' },
    { d: 'M38 198 L150 180 L153 196 L41 214 Z', fill: '#F2C66D' },
    { d: 'M84 136 l8 12 l-8 10 l-8 -10 Z', fill: '#3FD17F' },
    { d: 'M48 154 l6 8 l-6 8 l-6 -8 Z', fill: '#F4EDE2' },
    { d: 'M132 140 l6 8 l-6 8 l-6 -8 Z', fill: '#F4EDE2' },
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
