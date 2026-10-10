import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '@/components/dashboard/dashboard.css';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { InviteCard } from '@/components/gift/InviteCard';
import { AppTopBar } from '@/components/header/AppTopBar';
import { CircuitStrip } from '@/components/shop/CircuitStrip';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { ShopFront } from '@/components/shop/ShopFront';
import { sectionOfId, type ShopSection } from '@/components/shop/ShopTabs';
import { ShopTeraStage } from '@/components/shop/ShopTeraStage';
import { TryOnDialog } from '@/components/shop/TryOnDialog';
import { BTN_PRIMARY, BTN_SMALL, CARD, FOCUS, SHOP_GRID } from '@/components/shop/shopStyles';
import { Wardrobe } from '@/components/wardrobe/Wardrobe';
import { LinkWalletDialog } from '@/components/wallet/LinkWalletDialog';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { useCompanion, useEquipOutfit } from '@/hooks/useCompanion';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useLives } from '@/hooks/useLives';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePassportView } from '@/hooks/usePassportView';
import { usePurchase } from '@/hooks/usePurchase';
import { useClaimItem, useShop } from '@/hooks/useShop';
import { useEquipAvatar } from '@/hooks/useShopWardrobe';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import { avatarOf } from '@/utils/avatarShop';
import { shelvesOf, withCompanionState } from '@/utils/shop';

const TAB = `min-h-11 flex-1 rounded-[10px] px-5 [font:700_15px_Inter] sm:flex-none ${FOCUS}`;
const isCosmetic = (item: ShopItem) => item.kind === 'ink' || item.kind === 'frame';

/** /shop — "Loja do Tera": try, buy, choose and understand. Two tabs: the shop and the wardrobe ("Personalizar", `?tab=wardrobe`). */
export default function ShopPage() {
  const { t } = useI18n();
  usePageTitle(t('shop.title'));
  const [params, setParams] = useSearchParams();
  const wardrobe = params.get('tab') === 'wardrobe';
  const shop = useShop();
  const companion = useCompanion();
  const avatar = useLearnerAvatar();
  const { lives, secondsToNext } = useLives();
  const equipOutfit = useEquipOutfit();
  const equipAvatar = useEquipAvatar();
  const claim = useClaimItem();
  const [trying, setTrying] = useState<string | null>(null);
  const purchase = usePurchase({ onPaid: () => setTrying(null) });
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState('');
  const [section, setSection] = useState<ShopSection>('avatars');
  // An ink or a frame goes on ONE certification: a trail whose certification is already minted.
  const pages = usePassportView().pages;
  const certs = useMemo<CertTarget[]>(() => pages.filter((p) => p.mintStatus === 'minted').map((p) => ({ trailId: p.trailId, title: p.trailTitle, daysDone: p.daysDone, totalDays: p.totalDays, tier: p.tier, credentialId: p.credentialId, assetAddress: p.assetAddress })), [pages]);
  const targetId = target || certs[0]?.trailId || '';
  const targetCert = certs.find((c) => c.trailId === targetId) ?? null;

  const joined = useMemo(() => withCompanionState(shop.data ?? [], companion.data), [shop.data, companion.data]);
  // On the shelf an ink or a frame is "owned" for the certification it is aimed at.
  const items = useMemo(() => joined.map((item) => (isCosmetic(item) ? { ...item, owned: Boolean(targetId) && item.ownedRefs.includes(targetId) } : item)), [joined, targetId]);
  const shelves = useMemo(() => shelvesOf(items), [items]);
  const byKey = (key: string | null) => items.find((i) => i.key === key);
  const hasWallet = Boolean(companion.wallet);
  const buying = byKey(purchase.state.itemKey);
  const tried = byKey(trying);
  const bought = buying ? avatarOf(buying) : null;

  const actions: ShopActions = {
    busy: purchase.busy || equipOutfit.isPending || equipAvatar.isPending || claim.isPending,
    hasWallet,
    buy: (item) => (hasWallet ? void purchase.buy(item.key, isCosmetic(item) ? targetId || undefined : undefined) : setLinking(true)),
    claim: (item) => claim.mutate(item.key),
    equip: (item) => {
      const face = avatarOf(item);
      if (face) equipAvatar.mutate(face);
      else equipOutfit.mutate(item.key);
    },
    unequip: () => equipOutfit.mutate(null),
    tryOn: (item) => setTrying(item.key),
  };

  const openTab = (next: 'shop' | 'wardrobe') => {
    const query = new URLSearchParams(params);
    if (next === 'wardrobe') query.set('tab', 'wardrobe');
    else query.delete('tab');
    setParams(query, { replace: true });
  };
  const openShelf = (section_: string, trailId?: string) => {
    if (trailId) setTarget(trailId);
    openTab('shop');
    const wanted = sectionOfId(section_);
    if (wanted) setSection(wanted);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => document.getElementById(section_)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="dash-root min-h-screen overflow-x-hidden text-[#F4EDE2]" style={SHOP_GRID} data-testid="shop-page">
      <AppTopBar />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-24 pt-5 sm:px-8 xl:pt-8">
        <Link to="/world" className="self-start [font:600_13px_Inter] text-[#A0978A] hover:text-[#F4EDE2]" data-testid="shop-world-link">{t('world.shopLink')}</Link>
        <div role="tablist" aria-label={t('shop.tabs')} className="flex w-full gap-1 self-start rounded-[14px] border border-[#262320] bg-[#141210] p-1 sm:w-auto" data-testid="shop-tabs">
          {(['shop', 'wardrobe'] as const).map((tab) => {
            const selected = (tab === 'wardrobe') === wardrobe;
            return (
              <button key={tab} type="button" role="tab" aria-selected={selected} onClick={() => openTab(tab)} data-testid={`shop-tab-${tab}`} className={`${TAB} ${selected ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}>
                {t(`shop.tab.${tab}`)}
              </button>
            );
          })}
        </div>
        {!wardrobe && <ShopTeraStage companion={companion.data?.companion ?? null} lives={lives} secondsToNext={secondsToNext} wallet={companion.wallet} avatar={avatar} outfitName={byKey(companion.outfit)?.title ?? null} />}
        {!hasWallet && !companion.isPending && (
          <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`} data-testid="shop-no-wallet">
            <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('shop.connectHint')}</span>
            <LinkWalletButton className={`${BTN_PRIMARY} ${BTN_SMALL}`} testId="shop-connect" />
          </div>
        )}
        {shop.isPending && <TeraLoader size="md" label={t('shop.loading')} className="py-16" />}
        {shop.isError && (
          <div className={`${CARD} flex flex-col items-center gap-4 p-8 text-center`} data-testid="shop-error">
            <p className="[font:500_15px_Inter] text-[#C9BFB0]">{t('shop.error')}</p>
            <button type="button" onClick={() => void shop.refetch()} className={`${BTN_PRIMARY} ${BTN_SMALL}`}>
              {t('shop.retry')}
            </button>
          </div>
        )}
        {shop.isSuccess && wardrobe && <Wardrobe items={joined} actions={actions} avatar={avatar} outfit={companion.outfit} certs={certs} failed={equipAvatar.isError || equipOutfit.isError} onShop={openShelf} />}
        {shop.isSuccess && !wardrobe && (
          <>
            <ShopFront shelves={shelves} actions={actions} lives={lives} certs={certs} targetId={targetId} onTarget={setTarget} claimFailed={claim.isError ? (claim.variables ?? null) : null} active={section} onActive={setSection} />
            {items.length === 0 && <p className="[font:500_15px_Inter] text-[#A0978A]">{t('shop.empty')}</p>}
            <section className="flex flex-col gap-4 border-t border-[#262320] pt-8" aria-label={t('shop.section.more')}>
              <CircuitStrip wallet={companion.wallet} />
              <InviteCard />
            </section>
          </>
        )}
      </main>
      {tried && <TryOnDialog item={tried} actions={actions} avatar={avatar} target={targetCert} buyDisabled={(isCosmetic(tried) && !targetId) || (tried.kind === 'life' && !tried.lifePack && Boolean(lives && lives.current >= lives.max))} onClose={() => setTrying(null)} />}
      {linking && <LinkWalletDialog onClose={() => setLinking(false)} />}
      <PurchaseDialog
        state={purchase.state}
        itemTitle={buying?.title ?? ''}
        itemKind={buying?.kind ?? 'outfit'}
        targetTitle={targetCert?.title ?? null}
        outfit={buying?.kind === 'outfit' ? buying.key : companion.outfit}
        art={bought ? <LearnerAvatar avatar={bought} size="xl" /> : undefined}
        action={bought && purchase.state.phase === 'paid' && avatar.key !== bought.key ? { label: t('tryon.equipNow'), onClick: () => (equipAvatar.mutate(bought), purchase.reset()) } : null}
        onRetry={purchase.retry}
        onFund={() => void purchase.fund()}
        onClose={purchase.reset}
      />
    </div>
  );
}
