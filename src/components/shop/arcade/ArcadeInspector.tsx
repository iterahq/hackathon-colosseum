import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { loreOf } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { LivesState, ShopItem } from '@/types/shop';
import type { CertTarget, ItemAction, ShopActions } from '@/types/shopView';
import { includesLine, isOffSeason, returnLine, shortPrice } from '../avatarRows';
import { PayButtons } from '../CrystalPay';
import { itemAction } from '../itemAction';
import { ShopUnlockLine } from '../ShopUnlockLine';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TEXT, CARD, FOCUS, MONO_LABEL, RARITY_EDGE } from '../shopStyles';
import { TryOnStage } from '../TryOnStage';
import { ArcadeArt } from './ArcadeTile';

const TRYABLE: readonly ShopItem['kind'][] = ['avatar', 'outfit', 'ink', 'frame'];
const TOGGLE = `min-h-9 flex-1 rounded-[8px] px-3 [font:700_12px_JetBrains_Mono] uppercase tracking-[.06em] ${FOCUS}`;

interface Props {
  item: ShopItem;
  actions: ShopActions;
  avatar: LearnerAvatar;
  lives: LivesState | null;
  certs: CertTarget[];
  targetId: string;
  onTarget: (trailId: string) => void;
  buyDisabled: boolean;
  claimFailed: boolean;
}

function Action({ item, action, testId, labels, className = '' }: { item: ShopItem; action: ItemAction; testId: string; labels: 'full' | 'short'; className?: string }) {
  if (action.id === 'buy') return <PayButtons item={item} action={action} testId={testId} labels={labels} walletLabel={labels === 'full' ? action.label : shortPrice(item.priceLabel)} stack className={className} keyClass={labels === 'full' ? '!min-h-12 !px-3 ![font:700_14px_Inter]' : '!min-h-9 !px-2 ![font:700_12px_Inter]'} />;
  return (
    <button type="button" disabled={action.disabled} onClick={action.run} data-testid={testId} data-action={action.id} className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} ${labels === 'full' ? 'w-full' : '!min-h-11 !px-4 ![font:700_13px_Inter]'} ${className}`}>
      {action.label}
    </button>
  );
}

/** The selected item, big: live on the learner's Tera or certification, what it is, and the one place it is bought. */
export function ArcadeInspector({ item, actions, avatar, lives, certs, targetId, onTarget, buyDisabled, claimFailed }: Props) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const [on, setOn] = useState(true);
  const tryable = TRYABLE.includes(item.kind);
  const cosmetic = item.kind === 'ink' || item.kind === 'frame';
  const target = certs.find((c) => c.trailId === targetId) ?? null;
  const action = itemAction(item, actions, t, { buyDisabled, withPrice: true });
  const offer = item.avatar ?? null;
  const lore = offer ? loreOf(item.key, locale) : null;
  const title = lore?.name ?? item.title;
  const edge = offer && !offer.free ? RARITY_EDGE[offer.rarity] : '#3FD17F';
  const capped = offer && !offer.free && offer.supply.max != null ? offer.supply : null;
  const includes = includesLine(item, t);
  const full = item.kind === 'life' && !item.lifePack && Boolean(lives && lives.current >= lives.max);

  return (
    <>
      <aside className={`${CARD} hidden min-h-0 flex-col overflow-hidden border-b-[5px] border-b-[#2E2A25] lg:flex`} aria-label={title} data-testid="shop-inspector" data-item={item.key}>
        <div className="relative flex h-[296px] flex-none flex-col items-center justify-center gap-2 overflow-hidden border-b border-[#262320] bg-[#0F0D0B] py-3">
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(55% 60% at 50% 50%, ${edge}3D, transparent 72%)` }} />
          <motion.div key={`${item.key}-${on}`} initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.16 }} className="relative flex min-h-0 flex-1 items-center justify-center [&_[data-testid=tryon-avatar-art]]:!h-[212px] [&_[data-testid=tryon-avatar-art]]:!w-[212px]" data-testid="inspector-stage">
            {tryable ? <TryOnStage item={item} on={on} avatar={avatar} target={target} /> : <ArcadeArt item={item} avatar={avatar} lives={lives} large />}
          </motion.div>
          {tryable && (
            <div role="group" aria-label={t('tryon.toggle')} className="relative flex w-[180px] flex-none gap-1 rounded-[10px] border border-[#2E2A25] bg-[#141210] p-1">
              {[false, true].map((side) => (
                <button key={String(side)} type="button" aria-pressed={on === side} onClick={() => setOn(side)} className={`${TOGGLE} ${on === side ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}>
                  {t(side ? 'tryon.with' : 'tryon.without')}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
          {offer && !offer.free && (
            <span className={`${MONO_LABEL} self-start rounded-full border px-2 py-[3px]`} style={{ borderColor: edge, color: edge }}>
              {offer.tierName} · {offer.rarityLabel}
            </span>
          )}
          <div>
            <h2 className="[font:700_32px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="inspector-name">{title}</h2>
            {lore?.epithet && <p className="mt-1 [font:600_13px/1.3_Inter] text-[#C9BFB0]">{lore.epithet}</p>}
          </div>
          {capped && (
            <div className="flex flex-col gap-1" data-testid="inspector-supply">
              <div className="h-[6px] overflow-hidden rounded-full bg-[#262320]" role="progressbar" aria-valuemin={0} aria-valuemax={capped.max ?? 0} aria-valuenow={capped.minted}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round((capped.minted / (capped.max || 1)) * 100))}%`, background: edge }} />
              </div>
              <span className={`${MONO_LABEL} !text-[10px] text-[#A0978A]`}>{t('arcade.minted', { minted: capped.minted, max: capped.max ?? 0 })}</span>
            </div>
          )}
          {offer?.season && (
            <p className={`[font:600_13px/1.4_Inter] ${isOffSeason(item) ? 'text-[#E0A86F]' : 'text-[#F2C66D]'}`}>
              {offer.season.label}
              {isOffSeason(item) ? ` · ${returnLine(item, locale, t)}` : ''}
            </p>
          )}
          {includes && <p className="[font:600_13px/1.4_Inter] text-[#C9BFB0]">{includes}</p>}
          <p className="line-clamp-4 [font:400_14px/1.5_Inter] text-[#C9BFB0]">{lore?.story || item.description}</p>
          {item.unlock && !item.owned && <ShopUnlockLine unlock={item.unlock} failed={claimFailed} />}
          {cosmetic &&
            (certs.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('shop.certs.target')}</span>
                <select value={targetId} onChange={(e) => onTarget(e.target.value)} data-testid="shop-cert-target" className="min-h-11 w-full rounded-[10px] border-2 border-[#2E2A25] bg-[#141210] px-3 [font:600_14px_Inter] text-[#F4EDE2]">
                  {certs.map((cert) => (
                    <option key={cert.trailId} value={cert.trailId}>
                      {cert.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="[font:500_13px/1.45_Inter] text-[#E0A86F]">{t('shop.certs.none')}</p>
            ))}
          {full && <p className="[font:600_13px/1.3_Inter] text-[#3FD17F]" data-testid="shop-lives-full-reason">{t('shop.lives.fullReason')}</p>}
        </div>
        <div className="flex flex-none flex-col gap-1 border-t border-[#262320] p-4">
          <Action item={item} action={action} testId="inspector-action" labels="full" />
          {tryable && (
            <button type="button" onClick={() => actions.tryOn(item)} className={`${BTN_TEXT} self-center`} data-testid="inspector-details">
              {t('arcade.details')}
            </button>
          )}
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-[#262320] bg-[#141210]/95 px-3 py-2 backdrop-blur lg:hidden" data-testid="shop-dock" data-item={item.key}>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => tryable && actions.tryOn(item)} disabled={!tryable} aria-label={tryable ? `${t('arcade.details')}: ${title}` : undefined} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] text-left ${FOCUS}`} data-testid="dock-open">
            <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[#262320] bg-[#0F0D0B]" style={{ borderBottomColor: edge, borderBottomWidth: 3 }}>
              <span className="flex scale-[0.62] items-center justify-center">
                <ArcadeArt item={item} avatar={avatar} lives={lives} />
              </span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate [font:700_18px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{title}</span>
              <span className={`${MONO_LABEL} truncate !text-[10px]`} style={{ color: offer && !offer.free ? edge : '#A0978A' }}>
                {offer && !offer.free ? `${offer.tierName} · ${offer.supply.max == null ? t('shop.avatar.unlimited') : `${offer.supply.minted}/${offer.supply.max}`}` : tryable ? t('arcade.details') : full ? t('shop.lives.fullReason') : shortPrice(item.priceLabel)}
              </span>
            </span>
          </button>
          <Action item={item} action={itemAction(item, actions, t, { buyDisabled })} testId="dock-action" labels="short" className="!w-[148px] flex-none !flex-col" />
        </div>
      </div>
    </>
  );
}
