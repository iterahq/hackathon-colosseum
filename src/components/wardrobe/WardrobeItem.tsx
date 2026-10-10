import type { ReactNode } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '@/components/shop/shopStyles';
import type { ItemAction } from '@/types/shopView';

interface Props {
  itemKey: string;
  art: ReactNode;
  title: string;
  /** One quiet line under the title (tier, "NFT", where it shows). */
  sub?: string | null;
  action: ItemAction;
}

/** One owned thing in the wardrobe: its picture, its name and the ONE thing to do with it. */
export function WardrobeItem({ itemKey, art, title, sub, action }: Props) {
  const inUse = action.id === 'inuse' || action.id === 'unequip';
  return (
    <article data-testid="wardrobe-item" data-item={itemKey} data-action={action.id} className={`${CARD} flex min-w-0 flex-col items-center gap-2 border-b-[5px] p-3 text-center ${inUse ? 'border-b-[#3FD17F]' : 'border-b-[#2E2A25]'}`}>
      <span className="flex h-[92px] items-center justify-center">{art}</span>
      <span className="line-clamp-2 [font:700_20px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</span>
      {sub && <span className="[font:600_10px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{sub}</span>}
      <button type="button" disabled={action.disabled} onClick={action.run} data-testid="wardrobe-action" className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} mt-auto !min-h-10 w-full !px-2 ![font:700_13px_Inter] ${action.id === 'inuse' ? '!border-[#3FD17F] !text-[#3FD17F] !opacity-100' : ''}`}>
        {action.label}
      </button>
    </article>
  );
}
