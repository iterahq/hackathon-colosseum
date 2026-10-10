import type { ItemBorder, ShopItem } from '@/types/shop';

/** Both currencies are on unless the backend says otherwise; a crystal price is also needed to pay with crystals. */
export const solEnabled = (item: ShopItem): boolean => item.solEnabled !== false;
export const crystalsEnabled = (item: ShopItem): boolean => item.crystalsEnabled !== false && item.priceCrystals != null && item.priceCrystals > 0;

/** The colours a swatch is drawn with: a border's ring colours, or the colour of a background / icon colour. */
export function swatchColors(item: ShopItem): string[] {
  if (item.border?.colors.length) return item.border.colors;
  return item.color ? [item.color] : ['#3FD17F'];
}

/** The ring of a border item; a plain green one when the backend sent none. */
export function borderOf(item: ShopItem): ItemBorder {
  return item.border ? { ...item.border, colors: swatchColors(item) } : { style: 'solid', colors: swatchColors(item), glow: false, animated: false };
}

/** 10000 -> "10 000" (pt) / "10,000" (en): a stable separator, whatever the browser's locale data says. */
export function formatCount(n: number, locale: string): string {
  const digits = String(Math.round(n));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'en' ? ',' : '\u00a0');
}
