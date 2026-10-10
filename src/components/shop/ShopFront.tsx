import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { LivesState, ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import type { ShopShelves } from '@/utils/shop';
import { AvatarPyramid } from './AvatarPyramid';
import { featuredOf, rowsOf } from './avatarRows';
import { LifePacks } from './LifePacks';
import { ShopArt } from './ShopArt';
import { ShopBordersSlot } from './ShopBordersSlot';
import { ShopFeatured } from './ShopFeatured';
import { ShopItemCard } from './ShopItemCard';
import { SECTION_ID, ShopTabs, type ShopSection } from './ShopTabs';
import { ShopUnlockLine } from './ShopUnlockLine';
import { MONO_LABEL } from './shopStyles';

interface Props {
  shelves: ShopShelves;
  actions: ShopActions;
  lives: LivesState | null;
  certs: CertTarget[];
  targetId: string;
  onTarget: (trailId: string) => void;
  /** Key of the item whose claim was refused. */
  claimFailed: string | null;
  /** The section on show; the page owns it so the wardrobe can link into a shelf. */
  active: ShopSection;
  onActive: (section: ShopSection) => void;
  /** The learner's avatar: the picture inside a border preview. */
  avatar: LearnerAvatar;
  /** Swatch kinds the backend lists: profile borders, backgrounds and icon colours. */
  balance?: number | null;
  borders?: readonly ShopItem[];
  backgrounds?: readonly ShopItem[];
  icons?: readonly ShopItem[];
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';

function Shelf({ id, hint, children }: { id: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex scroll-mt-16 flex-col gap-3" id={id} role="tabpanel" aria-labelledby={`${id}-tab`} data-testid={id}>
      {hint && <p className="max-w-[640px] [font:400_13px/1.45_Inter] text-[#A0978A]">{hint}</p>}
      {children}
    </section>
  );
}

/** The shop: a sticky row of category chips and the one section it points to (avatars, lives, borders, outfits, certifications). */
export function ShopFront({ shelves, actions, lives, certs, targetId, onTarget, claimFailed, active, onActive, avatar, balance = null, borders = [], backgrounds = [], icons = [] }: Props) {
  const { t } = useI18n();
  const full = lives ? lives.current >= lives.max : false;
  const featured = featuredOf(rowsOf(shelves.avatars).rows);
  const card = (item: ShopItem, extra: { children?: ReactNode; buyDisabled?: boolean; tryable?: boolean } = {}) => (
    <ShopItemCard key={item.key} item={item} art={<ShopArt item={item} lives={lives} />} actions={actions} buyDisabled={extra.buyDisabled} tryable={extra.tryable} compact>
      {extra.children}
    </ShopItemCard>
  );
  const sections: ShopSection[] = [
    ...(shelves.avatars.length > 0 ? (['avatars'] as const) : []),
    ...(shelves.lives.length > 0 ? (['lives'] as const) : []),
    ...(borders.length > 0 ? (['borders'] as const) : []),
    ...(shelves.outfits.length > 0 ? (['outfits'] as const) : []),
    ...(shelves.certs.length > 0 ? (['certs'] as const) : []),
    ...(backgrounds.length > 0 ? (['backgrounds'] as const) : []),
    ...(icons.length > 0 ? (['icons'] as const) : []),
  ];
  const shown = sections.includes(active) ? active : sections[0];

  return (
    <>
      <ShopTabs sections={sections} active={shown} onChange={onActive} balance={balance} />
      {shown === 'avatars' && (
        <Shelf id={SECTION_ID.avatars}>
          {featured && <ShopFeatured item={featured} actions={actions} />}
          <AvatarPyramid items={shelves.avatars} actions={actions} />
        </Shelf>
      )}
      {shown === 'outfits' && (
        <Shelf id={SECTION_ID.outfits} hint={t('shop.section.clothesHint')}>
          <div className={GRID}>{shelves.outfits.map((item) => card(item, { children: item.unlock && !item.owned ? <ShopUnlockLine unlock={item.unlock} failed={claimFailed === item.key} /> : undefined }))}</div>
        </Shelf>
      )}
      {shown === 'certs' && (
        <Shelf id={SECTION_ID.certs} hint={certs.length > 0 ? t('shop.section.certsHint') : t('shop.certs.none')}>
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
      {shown === 'lives' && (
        <Shelf id={SECTION_ID.lives} hint={t('shop.section.livesHint')}>
          <LifePacks items={shelves.lives} actions={actions} full={full} />
        </Shelf>
      )}
      {shown === 'borders' && (
        <Shelf id={SECTION_ID.borders}>
          <ShopBordersSlot items={borders} actions={actions} avatar={avatar} hint={t('shop.swatch.sectionBorders')} />
        </Shelf>
      )}
      {shown === 'backgrounds' && (
        <Shelf id={SECTION_ID.backgrounds}>
          <ShopBordersSlot items={backgrounds} actions={actions} avatar={avatar} hint={t('shop.swatch.sectionBackgrounds')} />
        </Shelf>
      )}
      {shown === 'icons' && (
        <Shelf id={SECTION_ID.icons}>
          <ShopBordersSlot items={icons} actions={actions} avatar={avatar} hint={t('shop.swatch.sectionIcons')} />
        </Shelf>
      )}
    </>
  );
}
