/** Pure view-model of the shop: the item list joined with the companion's live state, split into shelves. */
import type { CompanionSnapshot, ShopItem } from '@/types/shop';

export interface ShopShelves {
  lives: ShopItem[];
  outfits: ShopItem[];
  certs: ShopItem[];
}

/**
 * The list says what is owned and equipped as of its last fetch; the companion cache is updated
 * the instant a purchase or an equip lands. Joining them keeps the cards right without a refetch.
 */
export function withCompanionState(items: readonly ShopItem[], snapshot: CompanionSnapshot | null | undefined): ShopItem[] {
  if (!snapshot) return [...items];
  const owned = new Set(snapshot.inventory.map((entry) => entry.itemKey));
  return items.map((item) => {
    if (item.kind === 'outfit') return { ...item, owned: item.owned || owned.has(item.key), equipped: snapshot.companion.outfit === item.key };
    return item;
  });
}

export function shelvesOf(items: readonly ShopItem[]): ShopShelves {
  return {
    lives: items.filter((i) => i.kind === 'life'),
    outfits: items.filter((i) => i.kind === 'outfit'),
    certs: items.filter((i) => i.kind === 'ink' || i.kind === 'frame'),
  };
}
