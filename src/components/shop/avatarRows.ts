/** Pure view-model of the avatar shelf: one row per rarity (rarest first), the featured avatar, season and "includes" lines. */
import type { AvatarRarity } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import { avatarState } from '@/utils/avatarShop';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export const ROW_ORDER: readonly AvatarRarity[] = ['primordial', 'mythic', 'legendary', 'epic', 'rare', 'common'];

export interface AvatarRow {
  rarity: AvatarRarity;
  tierName: string;
  rarityLabel: string;
  /** USD part of the backend price label ("US$ 100.00"), without the SOL conversion. */
  priceShort: string;
  /** Crystal price of the tier, when the tier can be bought with crystals. */
  priceCrystals: number | null;
  /** Minted and cap summed over the row; `max` null when any avatar of the row is unlimited. */
  supply: { minted: number; max: number | null };
  items: ShopItem[];
}

export interface AvatarRows {
  rows: AvatarRow[];
  free: ShopItem[];
}

export const shortPrice = (label: string): string => label.split('≈')[0].trim();

export function rowsOf(items: readonly ShopItem[]): AvatarRows {
  const avatars = items.filter((i) => i.kind === 'avatar' && i.avatar);
  const paid = avatars.filter((i) => !i.avatar?.free);
  const rows = ROW_ORDER.map((rarity): AvatarRow | null => {
    const list = paid.filter((i) => i.avatar?.rarity === rarity);
    const first = list[0];
    if (!first?.avatar) return null;
    const capped = list.every((i) => i.avatar?.supply.max != null);
    return {
      rarity,
      tierName: first.avatar.tierName,
      rarityLabel: first.avatar.rarityLabel,
      priceShort: shortPrice(first.priceLabel),
      priceCrystals: first.priceCrystals ?? null,
      supply: { minted: list.reduce((n, i) => n + (i.avatar?.supply.minted ?? 0), 0), max: capped ? list.reduce((n, i) => n + (i.avatar?.supply.max ?? 0), 0) : null },
      items: list,
    };
  }).filter((row): row is AvatarRow => row !== null);
  return { rows, free: avatars.filter((i) => i.avatar?.free) };
}

/** Listed but not buyable today: its season window is closed and the learner does not own it. */
export const isOffSeason = (item: ShopItem): boolean => Boolean(item.avatar?.season && !item.avatar.season.available && !item.owned);

/** "Back in December": the month the season opens again, in the viewer's language. */
export function returnLine(item: ShopItem, locale: string, t: Translate): string {
  const starts = item.avatar?.season?.startsAt;
  const date = starts ? new Date(starts) : null;
  if (!date || Number.isNaN(date.getTime())) return t('shop.season.out');
  return t('shop.season.returns', { month: date.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' }) });
}

/** "Includes: Nulo's border · glasses", or '' when the avatar brings nothing along. */
export function includesLine(item: ShopItem, t: Translate): string {
  const list = item.avatar?.includes ?? [];
  return list.length ? t('shop.includes', { items: list.map((i) => i.title).join(' · ') }) : '';
}

/** The rarest avatar the learner can still buy: the one tile that gets the spotlight. */
export function featuredOf(rows: readonly AvatarRow[]): ShopItem | null {
  for (const row of rows) {
    const hit = row.items.find((i) => avatarState(i) === 'buy' && !isOffSeason(i));
    if (hit) return hit;
  }
  return null;
}
