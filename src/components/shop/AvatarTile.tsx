import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { avatarLore } from '@/utils/avatarLore';
import { avatarOf, avatarState, supplyText } from '@/utils/avatarShop';
import { itemAction } from './itemAction';
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS, MONO_LABEL } from './shopStyles';

const KEY = '!min-h-10 w-full !px-2 ![font:700_13px_Inter]';

/** One avatar of the pyramid: the round portrait (tap to try it on), its name, its supply and the one thing to do with it. */
export function AvatarTile({ item, actions }: { item: ShopItem; actions: ShopActions }) {
  const { t, locale } = useI18n();
  const avatar = avatarOf(item);
  if (!avatar || !item.avatar) return null;
  const state = avatarState(item);
  const action = itemAction(item, actions, t);
  const name = avatarLore(item.key, locale)?.name ?? item.title;
  const dim = state === 'soldout';

  return (
    <article data-testid="avatar-tile" data-item={item.key} data-state={state} data-rarity={item.avatar.rarity} className="flex w-full min-w-0 flex-col items-center gap-2 sm:w-[132px]">
      <button type="button" onClick={() => actions.tryOn(item)} aria-label={`${t('shop.preview')}: ${name}`} data-testid="avatar-tryon" className={`group flex w-full flex-col items-center gap-1.5 rounded-[12px] px-1 pt-1 ${FOCUS}`}>
        <span className="relative">
          <LearnerAvatar avatar={avatar} size="lg" thumb className={`transition-transform group-hover:scale-105 motion-reduce:transition-none ${dim ? 'opacity-45 grayscale' : ''}`} />
          {state === 'equipped' && <span aria-hidden className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#141210] bg-[#3FD17F] [font:700_12px_Inter] text-[#0A0908]">✓</span>}
        </span>
        <span className="line-clamp-2 min-h-[2.1em] text-center [font:700_19px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{name}</span>
        <span className={`${MONO_LABEL} !text-[10px] text-[#A0978A] group-hover:text-[#3FD17F]`}>
          {item.avatar.free ? t('shop.preview') : `${supplyText(item.avatar.supply, t('shop.avatar.unlimited'))} · ${t('shop.preview')}`}
        </span>
      </button>
      <button type="button" disabled={action.disabled} onClick={action.run} data-testid="avatar-action" data-action={action.id} className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} ${KEY}`}>
        {action.label}
      </button>
    </article>
  );
}
