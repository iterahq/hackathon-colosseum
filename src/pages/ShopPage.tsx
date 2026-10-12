import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import '@/components/dashboard/dashboard.css';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { AppTopBar } from '@/components/header/AppTopBar';
import { FOCUS_BUILD, FOCUS_SHOP_ONLY, FOCUS_SOL_ONLY_SHOP } from '@/config/focus';
import { CircuitStrip } from '@/components/shop/CircuitStrip';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { ShopArcade } from '@/components/shop/arcade/ShopArcade';
import type { ArcadeCategory } from '@/components/shop/arcade/arcadeModel';
import { CrystalNotice, CrystalPayProvider } from '@/components/shop/CrystalPay';
import { useCrystalPurchase } from '@/components/shop/useCrystalPurchase';
import { sectionOfId } from '@/components/shop/ShopTabs';
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
import { focusShopItems, isHiddenPaidTera } from '@/utils/focusShop';
import { withCompanionState } from '@/utils/shop';

const TAB = `min-h-11 flex-1 rounded-[10px] px-5 [font:700_15px_Inter] sm:flex-none ${FOCUS}`;
const isCosmetic = (item: ShopItem) => item.kind === 'ink' || item.kind === 'frame';

/** /shop — "Loja do Tera": try, buy, choose and understand. Two tabs: the shop and the wardrobe ("Personalizar", `?tab=wardrobe`). The focus build pays in SOL only, and keeps the Circuit line and the lore link in a footer. */
export default function ShopPage() {
  const { t } = useI18n();
  usePageTitle(t('shop.title'));
  const [params, setParams] = useSearchParams();
  const wardrobe = params.get('tab') === 'wardrobe';
  const shop = useShop();
  const companion = useCompanion();
  const avatar = useLearnerAvatar();
  const { lives } = useLives();
  const equipOutfit = useEquipOutfit();
  const equipAvatar = useEquipAvatar();
  const claim = useClaimItem();
  const [trying, setTrying] = useState<string | null>(null);
  const crystalPay = useCrystalPurchase();
  const purchase = usePurchase({ onPaid: () => setTrying(null) });
  // A crystal payment closes the try-on the same way a wallet payment does.
  const crystalPhase = crystalPay.state.phase;
  useEffect(() => {
    if (crystalPhase === 'paid') setTrying(null);
  }, [crystalPhase]);
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState('');
  const [section, setSection] = useState<ArcadeCategory>(FOCUS_SHOP_ONLY ? 'certs' : 'avatars');
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#invite') setSection('more');
  }, [hash]);
  // An ink or a frame goes on ONE certification: a trail whose certification is already minted.
  const pages = usePassportView().pages;
  const certs = useMemo<CertTarget[]>(() => pages.filter((p) => p.mintStatus === 'minted').map((p) => ({ trailId: p.trailId, title: p.trailTitle, daysDone: p.daysDone, totalDays: p.totalDays, tier: p.tier, credentialId: p.credentialId, assetAddress: p.assetAddress })), [pages]);
  const targetId = target || certs[0]?.trailId || '';
  const targetCert = certs.find((c) => c.trailId === targetId) ?? null;

  // The focus build sells for SOL only: the crystal price leaves every row before the shelves are built.
  // `joined` is what the wardrobe wears: the free faces and what is owned. The shelves list every Tera.
  const all = useMemo(() => withCompanionState(shop.data ?? [], companion.data).map((item) => (FOCUS_SOL_ONLY_SHOP ? { ...item, crystalsEnabled: false, priceCrystals: null } : item)), [shop.data, companion.data]);
  const joined = useMemo(() => focusShopItems(all, 'wardrobe'), [all]);
  // On the shelf an ink or a frame is "owned" for the certification it is aimed at.
  const items = useMemo(() => focusShopItems(all, 'shelf').map((item) => (isCosmetic(item) ? { ...item, owned: Boolean(targetId) && item.ownedRefs.includes(targetId) } : item)), [all, targetId]);
  const byKey = (key: string | null) => items.find((i) => i.key === key);
  const hasWallet = Boolean(companion.wallet);
  const buying = byKey(purchase.state.itemKey);
  const tried = byKey(trying);
  const bought = buying ? avatarOf(buying) : null;
  const crystalItem = byKey(crystalPay.state.itemKey);
  const crystalBought = crystalItem ? avatarOf(crystalItem) : null;

  const actions: ShopActions = {
    busy: purchase.busy || equipOutfit.isPending || equipAvatar.isPending || claim.isPending,
    hasWallet,
    buy: (item) => (isHiddenPaidTera(item) ? undefined : hasWallet ? void purchase.buy(item.key, isCosmetic(item) ? targetId || undefined : undefined) : setLinking(true)),
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
  };

  return (
    <CrystalPayProvider value={FOCUS_SOL_ONLY_SHOP ? null : { onPayWithCrystals: crystalPay.pay, busy: crystalPay.busy, balance: crystalPay.balance, refId: targetId || undefined }}>
    <div className={`dash-root min-h-screen overflow-x-hidden text-[#F4EDE2] ${wardrobe ? '' : 'lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden'}`} style={SHOP_GRID} data-testid="shop-page">
      <AppTopBar />
      <main className={`mx-auto flex w-full flex-col gap-3 px-4 pt-3 sm:px-8 ${wardrobe ? 'max-w-[1280px] pb-16 xl:pt-4' : 'max-w-[1440px] pb-20 lg:min-h-0 lg:flex-1 lg:pb-4'}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div role="tablist" aria-label={t('shop.tabs')} className="flex w-full gap-1 rounded-[14px] border border-[#262320] bg-[#141210] p-1 sm:w-auto" data-testid="shop-tabs">
          {(['shop', 'wardrobe'] as const).map((tab) => {
            const selected = (tab === 'wardrobe') === wardrobe;
            return (
              <button key={tab} type="button" role="tab" aria-selected={selected} onClick={() => openTab(tab)} data-testid={`shop-tab-${tab}`} className={`${TAB} ${selected ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}>
                {t(`shop.tab.${tab}`)}
              </button>
            );
          })}
        </div>
          {!FOCUS_BUILD && <Link to="/world" className="[font:600_13px_Inter] text-[#A0978A] hover:text-[#F4EDE2]" data-testid="shop-world-link">{t('world.shopLink')}</Link>}
        </div>
        {wardrobe && !hasWallet && !companion.isPending && (
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
        {shop.isSuccess && !wardrobe && items.length === 0 && <p className="[font:500_15px_Inter] text-[#A0978A]">{t('shop.empty')}</p>}
        {shop.isSuccess && !wardrobe && items.length > 0 && (
          <ShopArcade items={items} actions={actions} avatar={avatar} lives={lives} companion={companion.data?.companion ?? null} wallet={companion.wallet} walletKnown={!companion.isPending} balance={FOCUS_SOL_ONLY_SHOP ? null : crystalPay.balance} certs={certs} targetId={targetId} onTarget={setTarget} claimFailed={claim.isError ? (claim.variables ?? null) : null} active={section} onActive={setSection} extras={!FOCUS_BUILD} />
        )}
        {FOCUS_BUILD && shop.isSuccess && !wardrobe && (
          <footer className="flex flex-col gap-2 max-lg:pb-[72px]" data-testid="shop-footer">
            <CircuitStrip wallet={companion.wallet} />
            <Link to="/world" className="self-start [font:600_13px_Inter] text-[#A0978A] hover:text-[#F4EDE2]" data-testid="shop-world-link">{t('world.shopLink')}</Link>
          </footer>
        )}
      </main>
      {tried && crystalPhase === 'idle' && <TryOnDialog item={tried} actions={actions} avatar={avatar} target={targetCert} buyDisabled={(isCosmetic(tried) && !targetId) || (tried.kind === 'life' && !tried.lifePack && Boolean(lives && lives.current >= lives.max))} onClose={() => setTrying(null)} />}
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
      <PurchaseDialog
        state={crystalPay.state}
        itemTitle={crystalItem?.title ?? ''}
        itemKind={crystalItem?.kind ?? 'outfit'}
        targetTitle={targetCert?.title ?? null}
        outfit={crystalItem?.kind === 'outfit' ? crystalItem.key : companion.outfit}
        art={crystalBought ? <LearnerAvatar avatar={crystalBought} size="xl" /> : undefined}
        action={crystalBought && crystalPay.state.phase === 'paid' && avatar.key !== crystalBought.key ? { label: t('tryon.equipNow'), onClick: () => (equipAvatar.mutate(crystalBought), crystalPay.reset()) } : null}
        onRetry={crystalPay.retry}
        onFund={crystalPay.reset}
        onClose={crystalPay.reset}
      />
      <CrystalNotice failure={crystalPay.failure} onClose={crystalPay.reset} />
    </div>
    </CrystalPayProvider>
  );
}
