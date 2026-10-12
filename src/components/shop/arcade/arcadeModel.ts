import { localizePriceLabel } from '@/utils/shopPrice';
import type { ShopItem } from '@/types/shop';
import { avatarState } from '@/utils/avatarShop';
import { ROW_ORDER, featuredOf, isOffSeason, rowsOf, shortPrice } from '../avatarRows';
import { crystalsEnabled, formatCount } from '../pay';
import { RARITY_EDGE } from '../shopStyles';
import type { ShopSection } from '../ShopTabs';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export type ArcadeCategory = ShopSection | 'more';

export const CATEGORY_ORDER: readonly ShopSection[] = ['avatars', 'lives', 'borders', 'outfits', 'certs', 'backgrounds', 'icons'];

const KINDS: Record<ShopSection, readonly ShopItem['kind'][]> = {
  avatars: ['avatar'],
  lives: ['life'],
  borders: ['border'],
  outfits: ['outfit'],
  certs: ['ink', 'frame'],
  backgrounds: ['background'],
  icons: ['app_icon'],
};

export interface ArcadeShelf {
  id: ShopSection;
  items: ShopItem[];
  /** Things of this shelf the learner has; null where owning is not a collection (lives). */
  owned: number | null;
  total: number;
}

const has = (item: ShopItem): boolean => item.owned || item.ownedRefs.length > 0 || item.avatar?.free === true;

export function shelvesOfArcade(items: readonly ShopItem[]): ArcadeShelf[] {
  return CATEGORY_ORDER.map((id): ArcadeShelf => {
    const list = items.filter((i) => KINDS[id].includes(i.kind) && (i.kind !== 'avatar' || Boolean(i.avatar)));
    return { id, items: list, owned: id === 'lives' ? null : list.filter(has).length, total: list.length };
  }).filter((shelf) => shelf.total > 0);
}

export interface ArcadeGroup {
  id: string;
  title: string;
  /** Price and supply of the tier, said once for the whole group. */
  note: string;
  edge: string;
  items: ShopItem[];
}

/** What a resale pays Itera, as a whole or one-decimal percentage: 500 -> "5". */
export const royaltyPercent = (bps: number): string => String(Math.round(bps / 10) / 10);

/** " · transferable · resale pays 5% to Itera" for a tier whose Teras on sale can change hands; the fee only once it is set on chain. */
function resaleNote(items: readonly ShopItem[], t: Translate): string {
  // What the tier sells: a Tera of it the learner already holds (earned in a chest, bound) says nothing about the ones for sale.
  const sale = items.filter((i) => !i.owned && i.avatar?.transferable);
  if (sale.length === 0) return '';
  const bps = Math.min(...sale.map((i) => i.avatar?.royaltyBps ?? 0));
  return ` · ${t('shelf.transferable')}${bps > 0 ? ` · ${t('shelf.fee', { pct: royaltyPercent(bps) })}` : ''}`;
}

export function groupsOf(shelf: ArcadeShelf, t: Translate, locale: string): ArcadeGroup[] {
  if (shelf.id === 'avatars') {
    // A Tera of an earn-only tier has no price: the three tiers share one group that says how they are earned.
    const earnOnly = (i: ShopItem) => i.avatar?.earnOnly === true;
    const { rows, free } = rowsOf(shelf.items.filter((i) => !earnOnly(i)));
    const tiers = rows.map((row): ArcadeGroup => {
      const crystals = row.priceCrystals != null ? ` · ${t('shop.crystals', { n: formatCount(row.priceCrystals, locale) })}` : '';
      const supply = row.supply.max == null ? t('shop.avatar.unlimited') : t('arcade.minted', { minted: row.supply.minted, max: row.supply.max });
      return { id: row.rarity, title: row.tierName, note: `${localizePriceLabel(row.priceShort, locale)}${crystals} · ${supply}${resaleNote(row.items, t)}`, edge: RARITY_EDGE[row.rarity], items: row.items };
    });
    const rank = (i: ShopItem) => ROW_ORDER.indexOf(i.avatar?.rarity ?? 'common');
    const earned = shelf.items.filter(earnOnly).sort((a, b) => rank(a) - rank(b));
    return [
      ...tiers,
      ...(earned.length ? [{ id: 'earn', title: t('shelf.earn.title'), note: t('shelf.earn.note'), edge: RARITY_EDGE.legendary, items: earned }] : []),
      ...(free.length ? [{ id: 'free', title: t('shop.avatar.free'), note: t('shop.avatar.freeHint'), edge: '#2E2A25', items: free }] : []),
    ];
  }
  if (shelf.id === 'borders') {
    const sale = shelf.items.filter((i) => i.forSale !== false);
    const signature = shelf.items.filter((i) => i.forSale === false);
    return [
      ...(sale.length ? [{ id: 'sale', title: '', note: '', edge: '#2E2A25', items: sale }] : []),
      ...(signature.length ? [{ id: 'signature', title: t('arcade.signature'), note: '', edge: '#2E2A25', items: signature }] : []),
    ];
  }
  return [{ id: shelf.id, title: '', note: '', edge: '#2E2A25', items: shelf.items }];
}

/** 150 -> "150", 2500 -> "2.5k", 100000 -> "100k": a price that fits a tile. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export type TileTone = 'price' | 'mine' | 'equipped' | 'free' | 'muted' | 'earn';

/** The one short line under a tile: what it costs or what it already is. */
export function tileLine(item: ShopItem, t: Translate, locale = 'en'): { text: string; tone: TileTone; crystal: boolean } {
  const plain = (text: string, tone: TileTone) => ({ text, tone, crystal: false });
  if (item.kind === 'avatar') {
    const state = avatarState(item);
    if (state === 'equipped') return plain(t('shop.equipped'), 'equipped');
    if (state === 'owned') return plain(t('shop.owned'), 'mine');
    if (state === 'free') return plain(t('arcade.free'), 'free');
    if (state === 'earn') return plain(t('shelf.earnOnly'), 'earn');
    if (state === 'soldout') return plain(t('shop.avatar.soldOut'), 'muted');
    if (isOffSeason(item)) return plain(item.avatar?.season?.label ?? t('shop.season.out'), 'muted');
  } else if (item.kind !== 'life') {
    if (item.equipped && item.owned) return plain(t('shop.equipped'), 'equipped');
    if (item.owned) return plain(t('shop.owned'), 'mine');
    if (item.forSale === false) return plain(t('shop.swatch.signature'), 'muted');
    if (item.unlock?.unlocked) return plain(t('shop.claim'), 'free');
  }
  if (crystalsEnabled(item)) return { text: compactCount(item.priceCrystals ?? 0), tone: 'price', crystal: true };
  return plain(localizePriceLabel(shortPrice(item.priceLabel).replace(/\.00$/, ''), locale), 'price');
}

/** What a shelf opens on: the rarest avatar still on sale, else the first thing that can be bought, else the first. */
export function defaultPick(shelf: ArcadeShelf): ShopItem | null {
  if (shelf.id === 'avatars') {
    const featured = featuredOf(rowsOf(shelf.items).rows);
    if (featured) return featured;
  }
  return shelf.items.find((i) => !has(i) && i.forSale !== false) ?? shelf.items[0] ?? null;
}
