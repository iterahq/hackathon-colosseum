import { useMemo, useState } from 'react';
import { InviteCard } from '@/components/gift/InviteCard';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { LearnerAvatar as AvatarPicture } from '@/components/avatar/LearnerAvatar';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { CompanionState, LivesState, ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import { CircuitStrip } from '../CircuitStrip';
import { formatCount } from '../pay';
import { BTN_PRIMARY, BTN_SMALL, CARD, FOCUS, MONO_LABEL } from '../shopStyles';
import { ArcadeInspector } from './ArcadeInspector';
import { ArcadeNav, categoryLabel, panelId, tabId } from './ArcadeNav';
import { ArcadeTile } from './ArcadeTile';
import { defaultPick, groupsOf, shelvesOfArcade, type ArcadeCategory } from './arcadeModel';

interface Props {
  items: ShopItem[];
  actions: ShopActions;
  avatar: LearnerAvatar;
  lives: LivesState | null;
  companion: CompanionState | null;
  wallet: string | null;
  /** False until the companion answered: the "link a wallet" card waits for it. */
  walletKnown: boolean;
  balance: number | null;
  certs: CertTarget[];
  targetId: string;
  onTarget: (trailId: string) => void;
  claimFailed: string | null;
  active: ArcadeCategory;
  onActive: (id: ArcadeCategory) => void;
}

const CHIP = `min-h-9 flex-none rounded-full border px-3 [font:700_12px_Inter] ${FOCUS}`;

/** The shop as a game armoury: categories on a rail, a dense grid of slots, and one inspector where the picked item is seen and bought. */
export function ShopArcade({ items, actions, avatar, lives, companion, wallet, walletKnown, balance, certs, targetId, onTarget, claimFailed, active, onActive }: Props) {
  const { t, locale } = useI18n();
  const shelves = useMemo(() => shelvesOfArcade(items), [items]);
  const shelf = shelves.find((s) => s.id === active) ?? (active === 'more' ? null : shelves[0] ?? null);
  const shown: ArcadeCategory = shelf?.id ?? 'more';
  const groups = useMemo(() => (shelf ? groupsOf(shelf, t, locale) : []), [shelf, t, locale]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('all');
  const inspected = shelf ?? shelves[0] ?? null;
  const selected = inspected ? (inspected.items.find((i) => i.key === picked[inspected.id]) ?? defaultPick(inspected)) : null;
  const visible = shown === 'avatars' && filter !== 'all' ? groups.filter((g) => g.id === filter) : groups;
  // On a phone several groups are one swipeable strip each, so the page stays about one screen tall.
  const strips = visible.length > 1;
  const select = (item: ShopItem) => inspected && setPicked((prev) => ({ ...prev, [inspected.id]: item.key }));
  const buyDisabled = selected ? ((selected.kind === 'ink' || selected.kind === 'frame') && !targetId) || (selected.kind === 'life' && !selected.lifePack && Boolean(lives && lives.current >= lives.max)) : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-[96px] lg:grid lg:grid-cols-[216px_minmax(0,1fr)_336px] lg:gap-4 lg:pb-0" data-testid="shop-arcade">
      <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-2.5 lg:overflow-y-auto lg:pr-1">
        <section className={`${CARD} hidden flex-col gap-2 p-3 lg:flex`} data-testid="shop-player">
          <div className="flex items-center gap-2.5">
            <AvatarPicture avatar={avatar} size="md" />
            <div className="flex min-w-0 flex-col">
              <span className="[font:700_20px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('shop.title')}</span>
              {companion && (
                <span className="truncate [font:600_11px_JetBrains_Mono] text-[#A0978A]">
                  {t('shop.companion.level', { level: companion.level })} · {companion.xp} XP
                </span>
              )}
            </div>
          </div>
          {lives && (
            <div className="flex items-center justify-between gap-2">
              <LivesHearts current={Math.min(lives.current, 5)} max={5} size={14} label={t('lives.chrome', { current: lives.current, max: lives.max })} className="gap-0.5" />
              <span className="[font:700_12px_JetBrains_Mono] tabular-nums text-[#F4EDE2]" data-testid="shop-lives-count">
                {lives.current}/{lives.max}
              </span>
            </div>
          )}
          {balance != null && (
            <span className="[font:700_12px_JetBrains_Mono] text-[#A0978A]" data-testid="shop-balance">
              {t('shop.pay.balance', { n: formatCount(balance, locale) })}
            </span>
          )}
          <span className={`${MONO_LABEL} !text-[9px] text-[#8A8175]`} data-testid="shop-devnet-note">{t('shop.devnetNote')}</span>
        </section>
        {!wallet && walletKnown && (
          <div className={`${CARD} flex items-center justify-between gap-3 p-3 lg:flex-col lg:items-stretch lg:gap-2`} data-testid="shop-no-wallet">
            <span className="[font:500_13px/1.35_Inter] text-[#C9BFB0] lg:text-[12px]">{t('shop.connectHint')}</span>
            <LinkWalletButton className={`${BTN_PRIMARY} ${BTN_SMALL} flex-none`} testId="shop-connect" />
          </div>
        )}
        <ArcadeNav shelves={shelves} active={shown} onChange={onActive} />
      </div>

      <section id={panelId(shown)} role="tabpanel" aria-labelledby={tabId(shown)} data-testid={panelId(shown)} className="flex min-h-0 min-w-0 flex-col gap-3 lg:rounded-[14px] lg:border lg:border-[#262320] lg:bg-[#141210] lg:p-4">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="[font:700_30px/1_'Barlow_Condensed'] text-[#F4EDE2]">{t(categoryLabel(shown))}</h1>
          {shelf?.owned != null && (
            <span className={`${MONO_LABEL} text-[#A0978A]`} data-testid="shop-collection">
              {t('arcade.collection')} {shelf.owned}/{shelf.total}
            </span>
          )}
          {shown === 'avatars' && groups.length > 1 && (
            <div className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(90deg,#000_calc(100%-32px),transparent)] lg:mx-0 lg:justify-end lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('arcade.collection')} data-testid="shop-rarity-filter">
              {[{ id: 'all', title: t('arcade.all'), edge: '#3FD17F' }, ...groups].map((g) => (
                <button key={g.id} type="button" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)} data-testid={`shop-filter-${g.id}`} className={`${CHIP} ${filter === g.id ? 'bg-[#262320] text-[#F4EDE2]' : 'bg-transparent text-[#A0978A] hover:text-[#F4EDE2]'}`} style={{ borderColor: filter === g.id ? g.edge : '#2E2A25' }}>
                  {g.id === 'free' ? t('arcade.free') : g.title}
                </button>
              ))}
            </div>
          )}
        </header>
        {shelf ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1" data-testid="shop-grid">
            {visible.map((group) => (
              <div key={group.id} className="flex flex-col gap-2" data-testid="shop-group" data-group={group.id}>
                {group.title && (
                  <div className="flex flex-wrap items-baseline gap-x-3 border-l-2 pl-2" style={{ borderLeftColor: group.edge }}>
                    <h2 className="[font:700_20px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{group.title}</h2>
                    <span className="[font:600_11px/1.4_JetBrains_Mono] text-[#A0978A]">{group.note}</span>
                    {strips && <span className="ml-auto [font:700_11px_JetBrains_Mono] text-[#A0978A] lg:hidden">{group.items.length}</span>}
                  </div>
                )}
                <div className={`${strips ? '-mx-4 flex snap-x scroll-pl-4 gap-2 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(90deg,#000_calc(100%-32px),transparent)] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:overflow-visible lg:p-0' : 'grid grid-cols-4 sm:grid-cols-6'} gap-2 lg:grid-cols-[repeat(auto-fill,minmax(84px,1fr))]`} data-strip={strips || undefined}>
                  {group.items.map((item) => (
                    <ArcadeTile key={item.key} item={item} selected={selected?.key === item.key} avatar={avatar} lives={lives} onSelect={select} className={strips ? 'w-[84px] flex-none snap-start lg:w-auto' : ''} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
            <CircuitStrip wallet={wallet} />
            <InviteCard />
          </div>
        )}
      </section>

      {selected && <ArcadeInspector key={selected.key} item={selected} actions={actions} avatar={avatar} lives={lives} certs={certs} targetId={targetId} onTarget={onTarget} buyDisabled={buyDisabled} claimFailed={claimFailed === selected.key} />}
    </div>
  );
}
