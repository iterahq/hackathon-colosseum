import { LORE_KEYS, loreKeysOfTier, type LoreTier, type TierMap } from '@/content/teraLore';

/** Teras whose portrait is not published yet (no `<key>_chip.webp` in the public bucket, checked 2026-10-11): the cast does not draw an empty ring for them. */
export const UNPUBLISHED_PORTRAITS: ReadonlySet<string> = new Set(['color_azul', 'acc_cibernetico', 'acc_capuz_verde', 'lang_javascript', 'lang_python', 'lang_rust']);

export const hasPortrait = (key: string): boolean => !UNPUBLISHED_PORTRAITS.has(key);

export const CAST_KEYS: readonly string[] = LORE_KEYS.filter(hasPortrait);

export const castKeysOfTier = (tier: LoreTier, avatars?: TierMap): string[] => loreKeysOfTier(tier, avatars).filter(hasPortrait);
