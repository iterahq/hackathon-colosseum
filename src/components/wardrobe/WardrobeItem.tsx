import type { ReactNode } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '@/components/shop/shopStyles';
import type { ItemAction } from '@/types/shopView';

interface Props {
  itemKey: string;
  art: ReactNode;
  title: string;
  /** One quiet line under the title (tier, "NFT", where it shows). */
  sub?: string | null;
  /** Under the quiet line: the origin of a Tera and the link to its proof. */
  extra?: ReactNode;
  action: ItemAction;
  /** `pending`: a small progress mark inside the button. `failed`: the button says so for a moment. Neither changes the tile's size. */
  status?: 'pending' | 'failed' | null;
  /** The label shown while `status` is `failed`. */
  failedLabel?: string;
  /** Marks the tile as the one being previewed (a theme item not bought yet). */
  previewing?: boolean;
}

/** One owned thing in the wardrobe: its picture, its name and the ONE thing to do with it. */
export function WardrobeItem({ itemKey, art, title, sub, extra, action, status = null, failedLabel = '', previewing = false }: Props) {
  const inUse = action.id === 'inuse' || action.id === 'unequip';
  return (
    <article data-testid="wardrobe-item" data-item={itemKey} data-action={action.id} data-status={status ?? undefined} data-previewing={previewing || undefined} className={`${CARD} flex min-w-0 flex-col items-center gap-2 border-b-[5px] p-3 text-center ${inUse || previewing ? 'border-b-[#3FD17F]' : 'border-b-[#2E2A25]'}`}>
      <span className="flex h-[92px] items-center justify-center">{art}</span>
      <span className="line-clamp-2 [font:700_20px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</span>
      {sub && <span className="[font:600_10px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{sub}</span>}
      {extra}
      <button
        type="button"
        disabled={action.disabled}
        aria-busy={status === 'pending' || undefined}
        onClick={status === 'pending' ? undefined : action.run}
        data-testid="wardrobe-action"
        className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} relative mt-auto !min-h-10 w-full !px-2 ![font:700_13px_Inter] ${action.id === 'inuse' ? '!border-[#3FD17F] !text-[#3FD17F] !opacity-100' : ''} ${status === 'failed' ? '!border-[#E0A86F] !text-[#E0A86F]' : ''}`}
      >
        <span className="line-clamp-2 text-center leading-tight">{status === 'failed' ? failedLabel : action.label}</span>
        {status === 'pending' && <span aria-hidden data-testid="wardrobe-progress" className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
      </button>
    </article>
  );
}
