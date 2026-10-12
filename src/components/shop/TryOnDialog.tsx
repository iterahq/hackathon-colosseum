import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArtZoom } from '@/components/artviewer';
import { trapTab } from '@/components/artviewer/focusTrap';
import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import { loreOf } from '@/content/teraLore';
import { supplyText } from '@/utils/avatarShop';
import { itemAction } from './itemAction';
import { PayButtons } from './CrystalPay';
import { ShopExplainer } from './ShopExplainer';
import { includesLine, isOffSeason, returnLine } from './avatarRows';
import { outfitDrawable } from './ShopLook';
import { TryOnStage } from './TryOnStage';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FOCUS, MONO_LABEL, RARITY_EDGE } from './shopStyles';

interface Props {
  item: ShopItem;
  actions: ShopActions;
  /** The learner's avatar today: the "without" side of an avatar try-on. */
  avatar: LearnerAvatar;
  /** The certification an ink or frame is aimed at. */
  target: CertTarget | null;
  buyDisabled?: boolean;
  onClose: () => void;
}

const TOGGLE = `min-h-11 flex-1 rounded-[9px] px-4 [font:700_13px_JetBrains_Mono] uppercase tracking-[.06em] ${FOCUS}`;

/** "How would it look": the item on a live stage with a before / after switch, what it changes, and the one action it offers. */
/** Source art too small to zoom: shown at card size only. */
const LOW_RES = new Set(['event_halloween', 'event_natal', 'event_verao', 'event_space', 'special_preto_cosmico', 'special_arco_iris']);

export function TryOnDialog({ item, actions, avatar, target, buyDisabled = false, onClose }: Props) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const [on, setOn] = useState(true);
  const panel = useRef<HTMLDivElement | null>(null);
  const action = itemAction(item, actions, t, { buyDisabled, withPrice: true });
  const offer = item.avatar ?? null;
  const lore = offer ? loreOf(item.key, locale) : null;
  const title = lore?.name ?? item.title;
  const cosmetic = item.kind === 'ink' || item.kind === 'frame';
  const caption = cosmetic ? (target ? t(on && item.owned ? 'tryon.real' : 'tryon.onCert', { trail: target.title }) : t('tryon.sample')) : null;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[data-testid="art-viewer"]')) return;
      if (e.key === 'Escape') return onClose();
      trapTab(e, panel.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0A0908]/85 backdrop-blur-sm sm:items-center sm:p-4" data-testid="tryon-dialog" data-item={item.key} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('tryon.title')}: ${title}`}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${CARD} flex max-h-[100dvh] w-full max-w-[820px] flex-col overflow-hidden max-sm:rounded-b-none sm:max-h-[92dvh] sm:flex-row`}
      >
        <div className="flex flex-none flex-col items-center gap-3 border-[#262320] bg-[#0F0D0B] p-4 max-sm:border-b sm:w-[340px] sm:justify-center sm:border-r sm:p-6">
          <div className="relative flex min-h-[224px] w-full items-center justify-center" data-testid="tryon-stage" data-on={on}>
            <TryOnStage item={item} on={on} avatar={avatar} target={target} />
            {offer && !LOW_RES.has(item.key) && <ArtZoom title={title} line={lore?.epithet || `${offer.tierName} · ${offer.rarityLabel}`} story={lore?.story} src={offer.imageUrl} asset={offer.assetAddress} className="absolute right-0 top-0" />}
          </div>
          {caption && <p className="text-center [font:500_12px/1.4_JetBrains_Mono] text-[#A0978A]">{caption}</p>}
          <div role="group" aria-label={t('tryon.toggle')} className="flex w-full max-w-[240px] gap-1 rounded-[12px] border border-[#2E2A25] bg-[#141210] p-1">
            {[false, true].map((side) => (
              <button key={String(side)} type="button" aria-pressed={on === side} onClick={() => setOn(side)} data-testid={side ? 'tryon-with' : 'tryon-without'} className={`${TOGGLE} ${on === side ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}>
                {t(side ? 'tryon.with' : 'tryon.without')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('tryon.title')}</span>
              {offer && !offer.free && (
                <span className={`${MONO_LABEL} rounded-full border px-2 py-[3px]`} style={{ borderColor: RARITY_EDGE[offer.rarity], color: RARITY_EDGE[offer.rarity] }} data-testid="tryon-rarity">
                  {offer.tierName} · {offer.rarityLabel}
                </span>
              )}
              {offer && !offer.free && <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('shop.avatar.serial', { supply: supplyText(offer.supply, t('shop.avatar.unlimited')) })}</span>}
            </div>
            <div>
              <h2 className="[font:700_34px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="tryon-name">{title}</h2>
              {lore?.epithet && <p className="mt-1 [font:600_14px/1.3_Inter] text-[#C9BFB0]" data-testid="tryon-epithet">{lore.epithet}</p>}
            </div>
            {offer?.season && (
              <p className={`[font:600_13px/1.4_Inter] ${isOffSeason(item) ? 'text-[#E0A86F]' : 'text-[#F2C66D]'}`} data-testid="tryon-season">
                {offer.season.label}
                {isOffSeason(item) ? ` · ${returnLine(item, locale, t)}` : ''}
              </p>
            )}
            {includesLine(item, t) && <p className="[font:600_13px/1.4_Inter] text-[#C9BFB0]" data-testid="tryon-includes">{includesLine(item, t)}</p>}
            <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]" data-testid="tryon-story">{lore?.story || item.description}</p>
            {lore?.quote && <p className="border-l-2 border-[#2E2A25] pl-3 [font:500_14px/1.45_Inter] italic text-[#A0978A]">{lore.quote}</p>}
            {item.kind === 'outfit' && !outfitDrawable(avatar) && <p className="[font:500_13px/1.45_Inter] text-[#E0A86F]" data-testid="tryon-outfit-note">{t(avatar.allowsOutfit ? 'tryon.outfitBase' : 'tryon.outfitNote')}</p>}
            <ShopExplainer item={item} />
          </div>
          <div className="flex flex-none flex-col gap-2 border-t border-[#262320] p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:flex-row-reverse sm:px-6">
            {action.id === 'earn' ? (
              <p data-testid="tryon-action" data-action="earn" className="flex items-center [font:600_14px/1.4_Inter] text-[#F2C66D] sm:flex-1">{action.label}</p>
            ) : action.id === 'buy' ? (
              <PayButtons item={item} action={action} testId="tryon-action" labels="full" walletLabel={action.label} autoFocus stack className="sm:flex-1" keyClass="!min-h-12 !px-3 ![font:700_14px_Inter]" />
            ) : (
              <button type="button" data-autofocus disabled={action.disabled} onClick={action.run} data-testid="tryon-action" data-action={action.id} className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} w-full sm:flex-1`}>
                {action.label}
              </button>
            )}
            <button type="button" onClick={onClose} data-testid="tryon-close" className={`${BTN_SECONDARY} w-full sm:w-auto`}>
              {t('tryon.close')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
