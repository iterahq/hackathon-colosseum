import type { ShopItem } from '@/types/shop';

/** Both currencies are on unless the backend says otherwise; a crystal price is also needed to pay with crystals. */
export const solEnabled = (item: ShopItem): boolean => item.solEnabled !== false;
export const crystalsEnabled = (item: ShopItem): boolean => item.crystalsEnabled !== false && item.priceCrystals != null && item.priceCrystals > 0;

const HEX = /^#[0-9a-f]{3,8}$/i;
const hex = (v: unknown): string[] => (typeof v === 'string' && HEX.test(v) ? [v] : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(hex) : []);

/** The colours a border, a background or an icon colour is drawn with. The field names are tolerant guesses until the backend lists them. */
export function swatchColors(item: ShopItem): string[] {
  const effect = item.effect ?? {};
  const border = effect.border && typeof effect.border === 'object' ? (effect.border as Record<string, unknown>) : {};
  const found = [...list(border.colors), ...list(effect.colors), ...hex(effect.color), ...hex(effect.value), ...hex(effect.bg), ...hex(effect.background), ...hex(effect.hex), ...hex(item.art.color)];
  return found.length ? found : ['#3FD17F'];
}

export interface BorderStyle {
  style: string;
  colors: string[];
  glow: boolean;
  animated: boolean;
}

export function borderOf(item: ShopItem): BorderStyle {
  const raw = item.effect?.border && typeof item.effect.border === 'object' ? (item.effect.border as Record<string, unknown>) : {};
  const style = typeof raw.style === 'string' ? raw.style : 'solid';
  return { style, colors: swatchColors(item), glow: raw.glow === true, animated: raw.animated === true };
}
