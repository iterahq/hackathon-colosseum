export const INKS = ['emerald', 'violet'] as const;
export const FRAMES = ['gold-leaf'] as const;
export const OUTFITS = ['outfit_glasses', 'outfit_crown', 'outfit_headphones', 'outfit_laurel'] as const;

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

/**
 * What a passport wears. Paid purchases are the durable truth; `state.cosmetics`
 * is a copy that a concurrent write of the row can drop, so it only fills in
 * what no purchase explains.
 */
export function resolveCosmetics(state: Record<string, unknown>, purchases: CosmeticPurchase[]): Cosmetics {
  const stored = cosmeticsOf(state);
  const paid = cosmeticsFromPurchases(purchases);
  return { ink: paid.ink ?? stored.ink, frame: paid.frame ?? stored.frame };
}

/** The row with `state.cosmetics` put back from the purchases. Untouched when they already agree. */
export function withCosmetics<Row extends { state: Record<string, unknown> }>(row: Row, purchases: CosmeticPurchase[]): Row {
  const cosmetics = resolveCosmetics(row.state, purchases);
  if (sameCosmetics(cosmetics, cosmeticsOf(row.state))) return row;
  return { ...row, state: { ...row.state, cosmetics } };
}
