import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import '@/components/dashboard/dashboard.css';
import { AppTopBar } from '@/components/header/AppTopBar';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { ShopArt } from '@/components/shop/ShopArt';
import { ShopItemCard } from '@/components/shop/ShopItemCard';
import { ShopTeraStage } from '@/components/shop/ShopTeraStage';
import { BTN_PRIMARY, BTN_SMALL, CARD, DEVNET_BADGE, MONO_LABEL, SHOP_GRID } from '@/components/shop/shopStyles';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { useCompanion, useEquipOutfit } from '@/hooks/useCompanion';
import { useLives } from '@/hooks/useLives';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePassportView } from '@/hooks/usePassportView';
import { usePurchase } from '@/hooks/usePurchase';
import { useShop } from '@/hooks/useShop';
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
  const { signInWithSolana } = useAuth();
  const shop = useShop();
  const companion = useCompanion();
  const { lives, secondsToNext } = useLives();
  const equip = useEquipOutfit();
  const [preview, setPreview] = useState<string | null>(null);
  const purchase = usePurchase({ onPaid: () => setPreview(null) });
  const certs = usePassportView().pages.filter((page) => page.credentialId);
  const [target, setTarget] = useState('');
  const targetId = target || certs[0]?.credentialId || '';

  const items = useMemo(() => withCompanionState(shop.data ?? [], companion.data), [shop.data, companion.data]);
  const shelves = useMemo(() => shelvesOf(items), [items]);
  const byKey = (key: string | null): ShopItem | undefined => items.find((i) => i.key === key);
  const hasWallet = Boolean(companion.wallet);
  const busy = purchase.busy || equip.isPending;
  const buying = byKey(purchase.state.itemKey);
  const shownKey = preview ?? companion.outfit;
  const buy = (item: ShopItem, refId?: string) => (hasWallet ? void purchase.buy(item.key, refId) : void signInWithSolana().then(() => companion.refetch()));

  const card = (item: ShopItem, extra?: { children?: ReactNode; buyDisabled?: boolean; refId?: string }) => (
    <ShopItemCard
      key={item.key}
      item={item}
      art={<ShopArt item={item} lives={lives} />}
      busy={busy}
      buyDisabled={extra?.buyDisabled}
      active={item.kind === 'outfit' && shownKey === item.key}
      onBuy={() => buy(item, extra?.refId)}
      onEquip={item.kind === 'outfit' ? () => (setPreview(null), equip.mutate(item.key)) : undefined}
      onUnequip={item.kind === 'outfit' ? () => (setPreview(null), equip.mutate(null)) : undefined}
      onPreview={item.kind === 'outfit' ? () => setPreview(preview === item.key ? null : item.key) : undefined}
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
          showing={{ key: shownKey, name: byKey(shownKey)?.title ?? null, preview: preview !== null && preview !== companion.outfit }}
        />
        {companion.data?.mocked && <span className={`${DEVNET_BADGE} -mt-6 self-start`}>{t('shop.mock')}</span>}
        {!hasWallet && !companion.isPending && (
          <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`} data-testid="shop-no-wallet">
            <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('shop.connectHint')}</span>
            <button type="button" onClick={() => void signInWithSolana().then(() => companion.refetch())} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="shop-connect">
              {t('shop.connect')}
            </button>
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
            {shelves.lives.length > 0 && (
              <Shelf id="shop-lives" title={t('shop.section.lives')}>
                <div className={GRID}>{shelves.lives.map((item) => card(item, { buyDisabled: lives ? lives.current >= lives.max : false }))}</div>
              </Shelf>
            )}
            {shelves.outfits.length > 0 && (
              <Shelf id="shop-outfits" title={t('shop.section.outfits')}>
                <div className={GRID}>{shelves.outfits.map((item) => card(item))}</div>
              </Shelf>
            )}
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
                        <option key={page.credentialId} value={page.credentialId ?? ''}>
                          {page.trailTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className={GRID}>{shelves.certs.map((item) => card(item, { buyDisabled: !targetId, refId: targetId || undefined }))}</div>
              </Shelf>
            )}
            {items.length === 0 && <p className="[font:500_15px_Inter] text-[#A0978A]">{t('shop.empty')}</p>}
          </>
        )}
      </main>
      <PurchaseDialog
        state={purchase.state}
        itemTitle={buying?.title ?? ''}
        itemKind={buying?.kind ?? 'outfit'}
        outfit={buying?.kind === 'outfit' ? buying.key : companion.outfit}
        onRetry={purchase.retry}
        onFund={() => void purchase.fund()}
        onClose={purchase.reset}
      />
    </div>
  );
}
