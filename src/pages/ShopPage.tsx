import { useMemo, useState, type ReactNode } from 'react';
import '@/components/dashboard/dashboard.css';
import { InviteCard } from '@/components/gift/InviteCard';
import { AppTopBar } from '@/components/header/AppTopBar';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { ShopArt } from '@/components/shop/ShopArt';
import { ShopItemCard } from '@/components/shop/ShopItemCard';
import { ShopTeraStage } from '@/components/shop/ShopTeraStage';
import { ShopUnlockLine } from '@/components/shop/ShopUnlockLine';
import { BTN_PRIMARY, BTN_SMALL, CARD, MONO_LABEL, SHOP_GRID } from '@/components/shop/shopStyles';
import { LinkWalletDialog } from '@/components/wallet/LinkWalletDialog';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { useCompanion, useEquipOutfit } from '@/hooks/useCompanion';
import { useLives } from '@/hooks/useLives';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePassportView } from '@/hooks/usePassportView';
import { usePurchase } from '@/hooks/usePurchase';
import { useClaimItem, useShop } from '@/hooks/useShop';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import { shelvesOf, withCompanionState } from '@/utils/shop';

const H2 = "[font:700_32px_'Barlow_Condensed']";
const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

function Shelf({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={id} data-testid={id}>
      <div>
        <h2 id={id} className={H2}>
          {title}
        </h2>
        {hint && <p className="mt-1 [font:400_14px_Inter] text-[#A0978A]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** /shop — "Loja do Tera": lives, Tera's outfits and certification cosmetics, paid from the learner's wallet. */
export default function ShopPage() {
  const { t } = useI18n();
  usePageTitle(t('shop.title'));
  const shop = useShop();
  const companion = useCompanion();
  const { lives, secondsToNext } = useLives();
  const equip = useEquipOutfit();
  const claim = useClaimItem();
  const [preview, setPreview] = useState<string | null>(null);
  const purchase = usePurchase({ onPaid: () => setPreview(null) });
  // An ink or a frame goes on ONE certification: a trail whose certification is already minted.
  const certs = usePassportView().pages.filter((page) => page.mintStatus === 'minted');
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState('');
  const targetId = target || certs[0]?.trailId || '';

  const items = useMemo(() => withCompanionState(shop.data ?? [], companion.data), [shop.data, companion.data]);
  const shelves = useMemo(() => shelvesOf(items), [items]);
  const byKey = (key: string | null): ShopItem | undefined => items.find((i) => i.key === key);
  const hasWallet = Boolean(companion.wallet);
  const busy = purchase.busy || equip.isPending || claim.isPending;
  const buying = byKey(purchase.state.itemKey);
  const shownKey = preview ?? companion.outfit;
  const buy = (item: ShopItem, refId?: string) => (hasWallet ? void purchase.buy(item.key, refId) : setLinking(true));

  const tryOn = (key: string) => {
    setPreview(preview === key ? null : key);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('[data-testid="shop-stage"]')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };

  const card = (item: ShopItem, extra?: { children?: ReactNode; buyDisabled?: boolean; refId?: string }) => (
    <ShopItemCard
      key={item.key}
      item={item}
      art={<ShopArt item={item} lives={lives} />}
      busy={busy}
      buyDisabled={extra?.buyDisabled}
      active={item.kind === 'outfit' && shownKey === item.key}
      onBuy={() => buy(item, extra?.refId)}
      onClaim={item.unlock?.unlocked && !item.owned ? () => claim.mutate(item.key) : undefined}
      onEquip={item.kind === 'outfit' ? () => (setPreview(null), equip.mutate(item.key)) : undefined}
      onUnequip={item.kind === 'outfit' ? () => (setPreview(null), equip.mutate(null)) : undefined}
      onPreview={item.kind === 'outfit' ? () => tryOn(item.key) : undefined}
    >
      {extra?.children}
    </ShopItemCard>
  );

  return (
    <div className="dash-root min-h-screen overflow-x-hidden text-[#F4EDE2]" style={SHOP_GRID} data-testid="shop-page">
      <AppTopBar />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-14 pt-6 sm:px-8 xl:pt-10">
        <ShopTeraStage
          companion={companion.data?.companion ?? null}
          lives={lives}
          secondsToNext={secondsToNext}
          wallet={companion.wallet}
          showing={{ key: shownKey, name: byKey(shownKey)?.title ?? null, preview: preview !== null && preview !== companion.outfit }}
        />
        <InviteCard />
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
        {shop.isSuccess && (
          <>
            {shelves.certs.length > 0 && (
              <Shelf id="shop-certs" title={t('shop.section.certs')} hint={certs.length > 0 ? t('shop.section.certsHint') : t('shop.certs.none')}>
                {certs.length > 0 && (
                  <label className="flex flex-wrap items-center gap-3">
                    <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('shop.certs.target')}</span>
                    <select
                      value={targetId}
                      onChange={(e) => setTarget(e.target.value)}
                      data-testid="shop-cert-target"
                      className="min-h-11 max-w-full rounded-[10px] border-2 border-[#2E2A25] bg-[#141210] px-3 [font:600_14px_Inter] text-[#F4EDE2]"
                    >
                      {certs.map((page) => (
                        <option key={page.trailId} value={page.trailId}>
                          {page.trailTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className={GRID}>{shelves.certs.map((item) => card({ ...item, owned: Boolean(targetId) && item.ownedRefs.includes(targetId) }, { buyDisabled: !targetId, refId: targetId || undefined }))}</div>
              </Shelf>
            )}
            {shelves.outfits.length > 0 && (
              <Shelf id="shop-outfits" title={t('shop.section.outfits')}>
                <div className={GRID}>{shelves.outfits.map((item) => card(item, { children: item.unlock && !item.owned ? <ShopUnlockLine unlock={item.unlock} failed={claim.isError && claim.variables === item.key} /> : undefined }))}</div>
              </Shelf>
            )}
            {shelves.lives.length > 0 && (
              <Shelf id="shop-lives" title={t('shop.section.lives')}>
                <div className={GRID}>{shelves.lives.map((item) => {
                    const full = lives ? lives.current >= lives.max : false;
                    return card(item, {
                      buyDisabled: full,
                      children: full ? (
                        <p className="[font:600_13px/1.4_Inter] text-[#3FD17F]" data-testid="shop-lives-full-reason">
                          {t('shop.lives.fullReason')}
                        </p>
                      ) : undefined,
                    });
                  })}</div>
              </Shelf>
            )}
            {items.length === 0 && <p className="[font:500_15px_Inter] text-[#A0978A]">{t('shop.empty')}</p>}
          </>
        )}
      </main>
      {linking && <LinkWalletDialog onClose={() => setLinking(false)} />}
      <PurchaseDialog
        state={purchase.state}
        itemTitle={buying?.title ?? ''}
        itemKind={buying?.kind ?? 'outfit'}
        targetTitle={certs.find((page) => page.trailId === targetId)?.trailTitle ?? null}
        outfit={buying?.kind === 'outfit' ? buying.key : companion.outfit}
        onRetry={purchase.retry}
        onFund={() => void purchase.fund()}
        onClose={purchase.reset}
      />
    </div>
  );
}
