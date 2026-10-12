import { FOCUS_PAID_TERAS_OFF } from '@/config/focus';
import type { LoreTier } from '@/content/teraLore';
import type { ShopItem } from '@/types/shop';
import type { TeraCatalog, TeraOrigin } from '@/types/tera';

/** The two ways a Tera is obtained: out of the chest of a studied day, or bought in the shop. */
export type ObtainWay = 'earn' | 'buy';

/**
 * How the Teras of a tier are obtained, said only once the live catalog answered. Every tier comes out of a chest; a
 * tier on the shelf can be bought as well. A starter face is not obtained at all, and a tier the catalog does not know
 * says nothing.
 */
export const obtainWays = (tier: LoreTier, catalog: TeraCatalog, paidOff: boolean = FOCUS_PAID_TERAS_OFF): ObtainWay[] => {
  if (catalog.source !== 'live' || tier === 'free') return [];
  const entry = catalog.tiers.find((t) => t.rarity === tier);
  if (!entry) return [];
  return entry.earnOnly || paidOff ? ['earn'] : ['earn', 'buy'];
};

/** How an earn-only tier is earned, as the catalog says it. Null: the catalog has no sentence for it. */
export const earnHow = (tier: LoreTier, catalog: TeraCatalog, locale: 'pt' | 'en'): string | null => (catalog.source === 'live' ? (catalog.tiers.find((t) => t.rarity === tier && t.earnOnly)?.how?.[locale] ?? null) : null);

/** The Teras a wallet holds, by key, with how each was obtained (null when the backend does not say). */
export type OwnedTeras = Readonly<Record<string, TeraOrigin | null>>;

/** Read from the learner's shop list: a Tera is held when the list says so and it is not a starter face. */
export const ownedTerasOf = (items: readonly Pick<ShopItem, 'key' | 'kind' | 'owned' | 'avatar'>[]): OwnedTeras =>
  Object.fromEntries(items.filter((item) => item.kind === 'avatar' && item.owned && item.avatar && !item.avatar.free).map((item) => [item.key, item.avatar?.origin ?? null]));
