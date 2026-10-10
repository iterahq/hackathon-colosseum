import type { ReactNode } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY } from '@/components/shop/shopStyles';
import { loreOf } from '@/content/teraLore';
import type { Locale } from '@/i18n';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ThemeItem, ThemeSlot } from '@/types/crystals';
import type { ItemAction, WardrobeGroupSpec } from '@/types/shopView';
import { ThemeSwatch } from './ThemeSwatch';
import { WardrobeItem } from './WardrobeItem';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** THE list of theme groups: a new slot the learner can choose from is one more row here. */
export const THEME_SLOTS: { slot: ThemeSlot; title: string; hint: string }[] = [
  { slot: 'border', title: 'wardrobe.group.border', hint: 'wardrobe.group.borderHint' },
  { slot: 'background', title: 'wardrobe.group.background', hint: 'wardrobe.group.backgroundHint' },
  { slot: 'icon', title: 'wardrobe.group.icon', hint: 'wardrobe.group.iconHint' },
];

export interface ThemeInput {
  items: ThemeItem[];
  balance: number;
  /** The item being previewed before it is bought. */
  preview: ThemeItem | null;
  marks: Record<string, 'pending' | 'failed'>;
  /** Text of the last purchase problem, shown in the confirm bar. */
  buyError: string | null;
  buying: boolean;
  onEquip: (item: ThemeItem) => void;
  onPreview: (item: ThemeItem | null) => void;
  onBuy: (item: ThemeItem) => void;
}

/** What a theme tile offers: use it, buy it with crystals, or says where it comes from. */
export function themeAction(item: ThemeItem, input: Pick<ThemeInput, 'onEquip' | 'onPreview'>, t: Translate, locale: Locale): ItemAction {
  if (item.owned && item.equipped) return { id: 'inuse', label: t('wardrobe.inUse'), disabled: true, primary: false };
  if (item.owned) return { id: 'equip', label: t('wardrobe.equip'), run: () => input.onEquip(item), disabled: false, primary: true };
  if (!item.forSale || item.priceCrystals === null) {
    const name = item.includedWith ? (loreOf(item.includedWith, locale)?.name ?? null) : null;
    return { id: 'soldout', label: name ? t('crystals.comesWith', { name }) : t('crystals.comesWithGeneric'), disabled: true, primary: false };
  }
  return { id: 'buy', label: t('wardrobe.theme.price', { n: item.priceCrystals }), run: () => input.onPreview(item), disabled: false, primary: false };
}

function ConfirmBar({ item, input, t }: { item: ThemeItem; input: ThemeInput; t: Translate }) {
  const price = item.priceCrystals ?? 0;
  const missing = Math.max(0, price - input.balance);
  return (
    <div role="group" aria-label={t('crystals.confirm.title', { name: item.title })} data-testid="crystals-confirm" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-[#3FD17F]/50 bg-[#141210] p-3">
      <div className="min-w-0 flex-1">
        <p className="[font:700_20px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('crystals.confirm.title', { name: item.title })}</p>
        <p className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('crystals.confirm.body', { price, balance: input.balance })} {t('crystals.confirm.previewing')}</p>
        <p aria-live="polite" className="[font:600_13px_Inter] text-[#E0A86F]">
          {input.buyError ?? (missing > 0 ? t('crystals.missing', { n: missing }) : '')}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => input.onPreview(null)} disabled={input.buying} className={`${BTN_SECONDARY} !min-h-10 !px-3 ![font:700_13px_Inter]`}>
          {t('crystals.confirm.no')}
        </button>
        <button type="button" onClick={() => input.onBuy(item)} disabled={input.buying || missing > 0} aria-busy={input.buying || undefined} data-testid="crystals-confirm-buy" className={`${BTN_PRIMARY} !min-h-10 !px-4 ![font:700_13px_Inter]`}>
          {t('crystals.confirm.yes')}
        </button>
      </div>
    </div>
  );
}

export function buildThemeGroups(input: ThemeInput, avatar: Avatar, locale: Locale, t: Translate): WardrobeGroupSpec[] {
  return THEME_SLOTS.map(({ slot, title, hint }): WardrobeGroupSpec | null => {
    const items = input.items.filter((i) => i.slot === slot);
    if (items.length === 0) return null;
    const content: ReactNode = (
      <div className="flex flex-col gap-3">
        {input.preview?.slot === slot && !input.preview.owned && <ConfirmBar item={input.preview} input={input} t={t} />}
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
          {items.map((item) => (
            <WardrobeItem
              key={item.key}
              itemKey={item.key}
              art={<ThemeSwatch item={item} avatar={avatar} />}
              title={item.key === 'border_none' ? t('wardrobe.border.none') : item.title}
              action={themeAction(item, input, t, locale)}
              status={input.marks[item.key] ?? null}
              failedLabel={t('wardrobe.equipFailed')}
              previewing={input.preview?.key === item.key}
            />
          ))}
        </div>
      </div>
    );
    return { id: slot, title: t(title), hint: t(hint), count: items.filter((i) => i.owned).length, content };
  }).filter((g): g is WardrobeGroupSpec => g !== null);
}
