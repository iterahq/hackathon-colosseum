import type { Locale } from '@/i18n';
import type { ReactNode } from 'react';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { itemAction } from '@/components/shop/itemAction';
import { BTN_TEXT } from '@/components/shop/shopStyles';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions, WardrobeGroupSpec } from '@/types/shopView';
import { loreOf } from '@/content/teraLore';
import { avatarOf } from '@/utils/avatarShop';
import { WardrobeCert } from './WardrobeCert';
import { WardrobeItem } from './WardrobeItem';

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface Input {
  items: ShopItem[];
  actions: ShopActions;
  avatar: Avatar;
  certs: CertTarget[];
  locale: Locale;
  t: Translate;
  /** Opens the shop on a section, optionally aimed at one certification. */
  onShop: (section: string, trailId?: string) => void;
}

const GRID = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]';

const empty = (text: string, cta: string, onClick: () => void): ReactNode => (
  <p className="flex flex-wrap items-center gap-x-3 [font:500_14px/1.45_Inter] text-[#A0978A]" data-testid="wardrobe-group-empty">
    {text}
    <button type="button" onClick={onClick} className={BTN_TEXT}>
      {cta} →
    </button>
  </p>
);

/**
 * THE list of wardrobe groups. A new thing to choose (a background, an icon colour) is one more
 * entry here: `{ id, title, hint, count, content }`. The chips and sections draw themselves.
 */
export function buildWardrobeGroups({ items, actions, avatar, certs, locale, t, onShop }: Input): WardrobeGroupSpec[] {
  const avatars = items.filter((i) => i.kind === 'avatar' && i.owned && i.avatar).sort((a, b) => Number(a.avatar?.free) - Number(b.avatar?.free));
  const outfits = items.filter((i) => i.kind === 'outfit' && i.owned);
  const cosmetics = items.filter((i) => i.kind === 'ink' || i.kind === 'frame');

  return [
    {
      id: 'avatar',
      title: t('wardrobe.group.avatar'),
      hint: t('wardrobe.group.avatarHint'),
      count: avatars.length,
      content: (
        <div className={GRID}>
          {avatars.map((item) => {
            const face = avatarOf(item);
            return face && <WardrobeItem key={item.key} itemKey={item.key} art={<LearnerAvatar avatar={face} size="lg" />} title={loreOf(item.key, locale)?.name ?? item.title} sub={item.avatar?.free ? null : `${item.avatar?.tierName} · NFT`} action={itemAction(item, actions, t)} />;
          })}
        </div>
      ),
    },
    {
      id: 'outfit',
      title: t('wardrobe.group.outfit'),
      hint: avatar.allowsOutfit ? t('wardrobe.group.outfitHint') : t('wardrobe.outfit.hidden'),
      count: outfits.length,
      content:
        outfits.length === 0 ? (
          empty(t('wardrobe.outfit.empty'), t('wardrobe.goShop'), () => onShop('shop-outfits'))
        ) : (
          <div className={GRID}>
            {outfits.map((item) => (
              <WardrobeItem key={item.key} itemKey={item.key} art={<TeraOutfit mood="neutral" size="bubble" idle={false} outfit={item.key} />} title={item.title} action={itemAction(item, actions, t)} />
            ))}
          </div>
        ),
    },
    {
      id: 'certs',
      title: t('wardrobe.group.certs'),
      hint: t('wardrobe.group.certsHint'),
      count: certs.length,
      content:
        certs.length === 0 ? (
          <p className="[font:500_14px/1.45_Inter] text-[#A0978A]" data-testid="wardrobe-group-empty">{t('wardrobe.certs.empty')}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {certs.map((cert) => (
              <WardrobeCert key={cert.trailId} cert={cert} cosmetics={cosmetics} onBuy={(trailId) => onShop('shop-certs', trailId)} />
            ))}
          </div>
        ),
    },
  ];
}
