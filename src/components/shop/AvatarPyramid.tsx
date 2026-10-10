import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { pyramidOf, supplyText } from '@/utils/avatarShop';
import { AvatarTile } from './AvatarTile';
import { MONO_LABEL, RARITY_EDGE } from './shopStyles';

/** Each step of the pyramid is wider than the one above it; on a phone every step takes the full width. */
const STEP = ['sm:max-w-[380px]', 'sm:max-w-[540px]', 'sm:max-w-[700px]', 'sm:max-w-[860px]', 'sm:max-w-none'] as const;
const TILES = 'grid grid-cols-2 justify-items-center gap-x-3 gap-y-5 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-4';

/** "Visuais do Tera": the avatars as a rarity pyramid, rarest on top, the free icons as its base. */
export function AvatarPyramid({ items, actions }: { items: ShopItem[]; actions: ShopActions }) {
  const { t } = useI18n();
  const { tiers, free } = useMemo(() => pyramidOf(items), [items]);
  const offset = STEP.length - tiers.length;

  return (
    <div className="flex flex-col items-center gap-4" data-testid="avatar-pyramid">
      {tiers.map((tier, index) => (
        <section key={tier.rarity} data-testid="avatar-tier" data-rarity={tier.rarity} aria-label={tier.tierName} className={`w-full rounded-[14px] border border-[#262320] border-t-2 bg-[#141210] px-3 pb-4 pt-3 sm:px-5 ${STEP[Math.max(0, index + offset)]}`} style={{ borderTopColor: RARITY_EDGE[tier.rarity] }}>
          <header className="mb-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center">
            <h3 className="[font:700_26px/1_'Barlow_Condensed'] text-[#F4EDE2]">{tier.tierName}</h3>
            <span className={`${MONO_LABEL} rounded-full border px-2 py-[2px]`} style={{ borderColor: RARITY_EDGE[tier.rarity], color: RARITY_EDGE[tier.rarity] }}>{tier.rarityLabel}</span>
            <span className={`${MONO_LABEL} text-[#A0978A]`} data-testid="avatar-tier-supply">{tier.supply.max == null ? t('shop.avatar.unlimited') : t('shop.avatar.minted', { supply: supplyText(tier.supply, '') })}</span>
            <span className="basis-full [font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="avatar-tier-price">{tier.priceLabel}</span>
          </header>
          <div className={TILES}>
            {tier.items.map((item) => (
              <AvatarTile key={item.key} item={item} actions={actions} />
            ))}
          </div>
        </section>
      ))}
      {free.length > 0 && (
        <section data-testid="avatar-free" aria-label={t('shop.avatar.free')} className="w-full rounded-[14px] border border-dashed border-[#2E2A25] px-3 pb-4 pt-3 sm:px-5">
          <header className="mb-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center">
            <h3 className="[font:700_26px/1_'Barlow_Condensed'] text-[#F4EDE2]">{t('shop.avatar.free')}</h3>
            <span className="[font:400_14px_Inter] text-[#A0978A]">{t('shop.avatar.freeHint')}</span>
          </header>
          <div className={TILES}>
            {free.map((item) => (
              <AvatarTile key={item.key} item={item} actions={actions} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
