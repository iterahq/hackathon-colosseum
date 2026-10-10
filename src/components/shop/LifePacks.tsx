import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { itemAction } from './itemAction';
import { PayButtons } from './CrystalPay';
import { shortPrice } from './avatarRows';
import { CARD, MONO_LABEL } from './shopStyles';

/** USD per life of a pack, or null for anything that is not a plain "+N lives" pack. */
export const perLifeCents = (item: ShopItem): number | null => (item.lifePack?.addLives && item.priceUsdCents > 0 ? item.priceUsdCents / item.lifePack.addLives : null);

/** The key of the pack with the lowest price per life. */
export function bestValueKey(items: readonly ShopItem[]): string | null {
  let best: { key: string; cents: number } | null = null;
  for (const item of items) {
    const cents = perLifeCents(item);
    if (cents != null && (!best || cents < best.cents)) best = { key: item.key, cents };
  }
  return best?.key ?? null;
}

const usd = (cents: number): string => `US$ ${(cents / 100).toFixed(3)}`;

/** Life packs as small cards (10 / 30 / 50 / 100 / infinite), with the price of one life and a tag on the best value. */
export function LifePacks({ items, actions, full }: { items: ShopItem[]; actions: ShopActions; full: boolean }) {
  const { t } = useI18n();
  const best = bestValueKey(items);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="life-packs">
      {items.map((item) => {
        const pack = item.lifePack;
        // A pack adds lives above the maximum; only the refill is pointless at full lives.
        const blocked = full && !pack;
        const action = itemAction(item, actions, t, { buyDisabled: blocked });
        const cents = perLifeCents(item);
        const infinite = Boolean(pack?.unlimitedDays);
        const headline = pack?.addLives ? t('shop.lives.packLives', { n: pack.addLives }) : infinite ? t('shop.lives.packInfinite') : item.title;
        const sub = infinite ? t('shop.lives.packDays', { n: pack?.unlimitedDays ?? 0 }) : cents != null ? t('shop.lives.perLife', { price: usd(cents) }) : item.description;
        return (
          <article key={item.key} data-testid="shop-item" data-item={item.key} data-state="buy" className={`${CARD} relative flex min-w-0 flex-col gap-1 p-3 ${best === item.key ? 'border-[#3FD17F]' : ''}`}>
            {best === item.key && <span className={`absolute -top-2 right-2 rounded-full bg-[#3FD17F] px-2 py-[1px] ${MONO_LABEL} !text-[9px] text-[#0A0908]`} data-testid="life-pack-best">{t('shop.lives.best')}</span>}
            <h3 className="[font:700_24px/1_'Barlow_Condensed'] text-[#F4EDE2]">{headline}</h3>
            <p className="line-clamp-2 min-h-[2.6em] [font:500_12px/1.3_JetBrains_Mono] text-[#A0978A]" data-testid="life-pack-per">{sub}</p>
            <span className="[font:700_12px/1.3_JetBrains_Mono] text-[#F4EDE2]" data-testid="shop-price">{shortPrice(item.priceLabel)}</span>
            {blocked && <p className="[font:600_11px/1.3_Inter] text-[#3FD17F]" data-testid="shop-lives-full-reason">{t('shop.lives.fullReason')}</p>}
            <PayButtons item={item} action={action} testId="shop-buy" walletLabel={action.label} stack className="mt-auto" />
          </article>
        );
      })}
    </div>
  );
}
