import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { loreOf } from '@/content/teraLore';
import { avatarOf, avatarState, supplyText } from '@/utils/avatarShop';
import { includesLine, isOffSeason, returnLine, shortPrice } from './avatarRows';
import { itemAction } from './itemAction';
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS, MONO_LABEL } from './shopStyles';

const KEY = '!min-h-9 w-full !px-1 ![font:700_12px_Inter]';

/** One avatar of a row: the round portrait (tap to try it on), its name, one small state line and the one thing to do with it. */
export function AvatarTile({ item, actions, reserveIncludes = false }: { item: ShopItem; actions: ShopActions; reserveIncludes?: boolean }) {
  const { t, locale } = useI18n();
  const avatar = avatarOf(item);
  if (!avatar || !item.avatar) return null;
  const state = avatarState(item);
  const action = itemAction(item, actions, t);
  const name = loreOf(item.key, locale)?.name ?? item.title;
  const off = isOffSeason(item);
  const dim = state === 'soldout' || off;
  const includes = includesLine(item, t);
  const season = item.avatar.season;
  const supply = item.avatar.free ? '' : supplyText(item.avatar.supply, '');
  const word = state === 'equipped' ? t('shop.avatar.stateInUse') : state === 'free' ? t('shop.avatar.stateFree') : state === 'owned' ? t('shop.avatar.stateOwned') : state === 'soldout' ? t('shop.avatar.soldOut') : off ? returnLine(item, locale, t) : '';
  const line = [word, supply && state !== 'free' ? supply : ''].filter(Boolean).join(' · ');
  const label = action.id === 'buy' ? shortPrice(item.priceLabel) : action.label;

  return (
    <article data-testid="avatar-tile" data-item={item.key} data-state={state} data-rarity={item.avatar.rarity} data-season={off ? 'out' : season ? 'in' : undefined} className="flex w-[100px] flex-none snap-start flex-col items-center gap-1">
      <button type="button" onClick={() => actions.tryOn(item)} aria-label={`${t('shop.preview')}: ${name}`} data-testid="avatar-tryon" className={`group flex w-full flex-col items-center gap-1 rounded-[12px] px-1 pt-1 ${FOCUS}`}>
        <span className="relative">
          <LearnerAvatar avatar={avatar} size="lg" thumb className={`!h-[72px] !w-[72px] transition-transform group-hover:scale-105 motion-reduce:transition-none ${dim ? 'opacity-45 grayscale' : ''}`} />
          {state === 'equipped' && <span aria-hidden className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#141210] bg-[#3FD17F] [font:700_12px_Inter] text-[#0A0908]">✓</span>}
          {season && (
            <span data-testid="avatar-season" className={`absolute -left-2 -top-1 max-w-[72px] truncate rounded-full border bg-[#141210] px-1.5 py-[1px] ${MONO_LABEL} !text-[9px] ${off ? 'border-[#2E2A25] text-[#A0978A]' : 'border-[#F2C66D] text-[#F2C66D]'}`}>
              {season.label}
            </span>
          )}
        </span>
        <span className="line-clamp-1 w-full text-center [font:700_18px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{name}</span>
        <span className={`${MONO_LABEL} line-clamp-1 w-full text-center !text-[10px] text-[#A0978A] group-hover:text-[#3FD17F]`} data-testid="avatar-state">
          {line || '\u00a0'}
        </span>
      </button>
      {(includes || reserveIncludes) && (
        <p className="line-clamp-2 min-h-[2.6em] w-full text-center [font:400_10px/1.3_Inter] text-[#C9BFB0]" title={includes} data-testid="avatar-includes">
          {includes}
        </p>
      )}
      <button type="button" disabled={action.disabled} onClick={action.run} aria-label={action.id === 'buy' ? `${action.label} ${item.priceLabel}` : undefined} data-testid="avatar-action" data-action={action.id} className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} ${KEY}`}>
        {label}
      </button>
    </article>
  );
}
