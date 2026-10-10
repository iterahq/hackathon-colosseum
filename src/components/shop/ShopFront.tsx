import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { LivesState, ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import type { ShopShelves } from '@/utils/shop';
import { AvatarPyramid } from './AvatarPyramid';
import { ShopArt } from './ShopArt';
import { ShopItemCard } from './ShopItemCard';
import { ShopUnlockLine } from './ShopUnlockLine';
import { H2, MONO_LABEL } from './shopStyles';

interface Props {
  shelves: ShopShelves;
  actions: ShopActions;
  lives: LivesState | null;
  certs: CertTarget[];
  targetId: string;
  onTarget: (trailId: string) => void;
  /** Key of the item whose claim was refused. */
  claimFailed: string | null;
}

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

function Shelf({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex scroll-mt-24 flex-col gap-4" id={id} aria-labelledby={`${id}-title`} data-testid={id}>
      <div>
        <h2 id={`${id}-title`} className={H2}>
          {title}
        </h2>
        {hint && <p className="mt-1 max-w-[640px] [font:400_14px/1.45_Inter] text-[#A0978A]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** The shelves of the shop, in the order a learner reads them: Tera's looks, outfits, certifications, lives. */
export function ShopFront({ shelves, actions, lives, certs, targetId, onTarget, claimFailed }: Props) {
  const { t } = useI18n();
  const full = lives ? lives.current >= lives.max : false;
  const card = (item: ShopItem, extra: { children?: ReactNode; buyDisabled?: boolean; tryable?: boolean } = {}) => (
    <ShopItemCard key={item.key} item={item} art={<ShopArt item={item} lives={lives} />} actions={actions} buyDisabled={extra.buyDisabled} tryable={extra.tryable}>
      {extra.children}
    </ShopItemCard>
  );

  return (
    <>
      {shelves.avatars.length > 0 && (
        <Shelf id="shop-avatars" title={t('shop.section.avatars')} hint={t('shop.section.avatarsHint')}>
          <AvatarPyramid items={shelves.avatars} actions={actions} />
        </Shelf>
      )}
      {shelves.outfits.length > 0 && (
        <Shelf id="shop-outfits" title={t('shop.section.clothes')} hint={t('shop.section.clothesHint')}>
          <div className={GRID}>{shelves.outfits.map((item) => card(item, { children: item.unlock && !item.owned ? <ShopUnlockLine unlock={item.unlock} failed={claimFailed === item.key} /> : undefined }))}</div>
        </Shelf>
      )}
      {shelves.certs.length > 0 && (
        <Shelf id="shop-certs" title={t('shop.section.certs')} hint={certs.length > 0 ? t('shop.section.certsHint') : t('shop.certs.none')}>
          {certs.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-wrap items-center gap-3">
                <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('shop.certs.target')}</span>
                <select value={targetId} onChange={(e) => onTarget(e.target.value)} data-testid="shop-cert-target" className="min-h-11 max-w-full rounded-[10px] border-2 border-[#2E2A25] bg-[#141210] px-3 [font:600_14px_Inter] text-[#F4EDE2]">
                  {certs.map((cert) => (
                    <option key={cert.trailId} value={cert.trailId}>
                      {cert.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="[font:400_13px/1.45_Inter] text-[#A0978A]" data-testid="shop-certs-replace">{t('shop.certs.replace')}</p>
            </div>
          )}
          <div className={GRID}>{shelves.certs.map((item) => card(item, { buyDisabled: !targetId }))}</div>
        </Shelf>
      )}
      {shelves.lives.length > 0 && (
        <Shelf id="shop-lives" title={t('shop.section.lives')} hint={t('shop.section.livesHint')}>
          <div className={GRID}>
            {shelves.lives.map((item) =>
              card(item, {
                buyDisabled: full,
                tryable: false,
                children: full ? (
                  <p className="[font:600_13px/1.4_Inter] text-[#3FD17F]" data-testid="shop-lives-full-reason">
                    {t('shop.lives.fullReason')}
                  </p>
                ) : undefined,
              })
            )}
          </div>
        </Shelf>
      )}
    </>
  );
}
