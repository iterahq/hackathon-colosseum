import type { ReactNode } from 'react';
import type { ShopItem } from '@/types/shop';

/**
 * Where the profile borders go. The shop-items list does not carry borders: the crystals slice feeds
 * this slot later with its own cards. With nothing to show it renders nothing (and its tab stays hidden).
 */
export function ShopBordersSlot({ items, render }: { items: readonly ShopItem[]; render?: (item: ShopItem) => ReactNode }) {
  if (items.length === 0) return null;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="shop-borders-slot">{items.map((item) => render?.(item) ?? null)}</div>;
}
