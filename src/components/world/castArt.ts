import { LORE_KEYS, loreKeysOfTier, type LoreTier, type TierMap } from '@/content/teraLore';

/** Teras whose portrait is not published yet (no `<key>_chip.webp` in the public bucket): the cast does not draw an empty ring for them. Empty since 2026-10-12: every key of the lore file has its art. */
export const UNPUBLISHED_PORTRAITS: ReadonlySet<string> = new Set();

export const hasPortrait = (key: string): boolean => !UNPUBLISHED_PORTRAITS.has(key);

export const CAST_KEYS: readonly string[] = LORE_KEYS.filter(hasPortrait);

export const castKeysOfTier = (tier: LoreTier, avatars?: TierMap): string[] => loreKeysOfTier(tier, avatars).filter(hasPortrait);
