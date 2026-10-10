import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { loreOf } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { avatarOf, supplyText } from '@/utils/avatarShop';
import { includesLine } from './avatarRows';
import { itemAction } from './itemAction';
import { PayButtons } from './CrystalPay';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TEXT, CARD, MONO_LABEL, RARITY_EDGE } from './shopStyles';

/** One slim strip for the rarest avatar still on sale: portrait, name, what it costs and includes, and the one action. */
export function ShopFeatured({ item, actions }: { item: ShopItem; actions: ShopActions }) {
  const { t, locale } = useI18n();
  const avatar = avatarOf(item);
  if (!avatar || !item.avatar) return null;
  const lore = loreOf(item.key, locale);
  const action = itemAction(item, actions, t);
  const includes = includesLine(item, t);

  return (
    <section className={`${CARD} flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 p-3 sm:flex-nowrap sm:gap-5 sm:p-4`} style={{ borderLeftColor: RARITY_EDGE[item.avatar.rarity] }} aria-label={t('shop.featured.label')} data-testid="shop-featured" data-item={item.key}>
      <button type="button" onClick={() => actions.tryOn(item)} aria-label={`${t('shop.preview')}: ${lore?.name ?? item.title}`} data-testid="shop-featured-art" className="flex-none rounded-full">
        <LearnerAvatar avatar={avatar} size="xl" className="max-sm:!h-20 max-sm:!w-20" />
      </button>
      <div className="flex min-w-0 flex-1 basis-[180px] flex-col gap-1">
        <span className={`${MONO_LABEL} !text-[10px] text-[#3FD17F]`}>{t('shop.featured.label')} · {t('shop.featured.rarest')}</span>
        <h3 className="[font:700_30px/1_'Barlow_Condensed'] text-[#F4EDE2] max-sm:text-[24px]">{lore?.name ?? item.title}</h3>
        <p className="[font:500_12px/1.4_JetBrains_Mono] text-[#A0978A]">
          {item.avatar.tierName} · {item.avatar.rarityLabel} · {supplyText(item.avatar.supply, t('shop.avatar.unlimited'))}
        </p>
        {includes && <p className="[font:400_13px/1.4_Inter] text-[#C9BFB0]">{includes}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <span className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="shop-featured-price">{item.priceLabel}</span>
        </div>
      </div>
      <div className="flex w-full flex-none flex-col items-stretch gap-1 sm:w-[210px]">
        {action.id === 'buy' ? (
          <PayButtons item={item} action={action} testId="shop-featured-action" labels="mid" walletLabel={action.label} className="sm:!flex-col" />
        ) : (
          <button type="button" disabled={action.disabled} onClick={action.run} data-testid="shop-featured-action" className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} !min-h-10 !px-4 ![font:700_14px_Inter]`}>
            {action.label}
          </button>
        )}
        <button type="button" onClick={() => actions.tryOn(item)} className={`${BTN_TEXT} !min-h-9`}>
          {t('shop.preview')}
        </button>
      </div>
    </section>
  );
}
