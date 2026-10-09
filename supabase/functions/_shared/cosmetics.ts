export const INKS = ['emerald', 'violet'] as const;
export const FRAMES = ['gold-leaf'] as const;
export const OUTFITS = ['outfit_glasses', 'outfit_crown', 'outfit_headphones'] as const;

export type Ink = (typeof INKS)[number];
export type Frame = (typeof FRAMES)[number];
export type Outfit = (typeof OUTFITS)[number];

export interface Cosmetics {
  ink: Ink | null;
  frame: Frame | null;
}

export const NO_COSMETICS: Cosmetics = { ink: null, frame: null };

export function isInk(value: unknown): value is Ink {
  return INKS.includes(value as Ink);
}

export function isFrame(value: unknown): value is Frame {
  return FRAMES.includes(value as Frame);
}

export function isOutfit(value: unknown): value is Outfit {
  return OUTFITS.includes(value as Outfit);
}

/** The cosmetics stored on a passport row. Anything that is not a known value reads as unset. */
export function cosmeticsOf(state: Record<string, unknown>): Cosmetics {
  const stored = state.cosmetics;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return NO_COSMETICS;
  const { ink, frame } = stored as Record<string, unknown>;
  return { ink: isInk(ink) ? ink : null, frame: isFrame(frame) ? frame : null };
}

export interface CosmeticPurchase {
  kind: string;
  /** `effect.value` of the item that was bought. */
  value: unknown;
  paid_at: string;
}

/** What a passport should wear given every paid cosmetic for its trail: the latest ink wins. */
export function cosmeticsFromPurchases(purchases: CosmeticPurchase[]): Cosmetics {
  const result: Cosmetics = { ink: null, frame: null };
  for (const purchase of [...purchases].sort((a, b) => a.paid_at.localeCompare(b.paid_at))) {
    if (purchase.kind === 'ink' && isInk(purchase.value)) result.ink = purchase.value;
    if (purchase.kind === 'frame' && isFrame(purchase.value)) result.frame = purchase.value;
  }
  return result;
}

export function sameCosmetics(a: Cosmetics, b: Cosmetics): boolean {
  return a.ink === b.ink && a.frame === b.frame;
}
