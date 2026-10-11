import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { loreOf } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { PayButtons } from './CrystalPay';
import { itemAction } from './itemAction';
import type { ItemBorder } from '@/types/shop';
import { borderOf, swatchColors } from './pay';
import { BTN_SECONDARY, CARD, MONO_LABEL } from './shopStyles';

/** The ring a border is drawn with, around the learner's own picture. */
function ringStyle(b: ItemBorder): React.CSSProperties {
  const [first, second = first] = b.colors;
  const glow = b.glow ? { boxShadow: `0 0 14px ${first}99` } : {};
  if (b.style === 'gradient') return { background: `linear-gradient(135deg, ${b.colors.join(', ')})`, ...glow };
  if (b.style === 'conic') return { background: `conic-gradient(${[...b.colors, first].join(', ')})`, ...glow };
  if (b.style === 'dashed') return { border: `3px dashed ${first}`, ...glow };
  if (b.style === 'double') return { background: `radial-gradient(circle, transparent 58%, ${first} 60%, ${first} 68%, transparent 70%, transparent 76%, ${second} 78%)`, ...glow };
  return { background: first, ...glow };
}

export function SwatchPreview({ item, avatar }: { item: ShopItem; avatar: Avatar }) {
  const colors = swatchColors(item);
  if (item.kind === 'border') {
    const b = borderOf(item);
    const dashed = b.style === 'dashed';
    return (
      <span className={`flex h-[60px] w-[60px] items-center justify-center rounded-full ${dashed ? '' : 'p-[4px]'}`} style={ringStyle(b)} data-testid="swatch-ring" data-style={b.style}>
        <LearnerAvatar avatar={avatar} size="md" className="!h-full !w-full" />
      </span>
    );
  }
  const fill = colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : colors[0];
  return <span className={`block h-[52px] w-[52px] border border-[#2E2A25] ${item.kind === 'app_icon' ? 'rounded-[14px]' : 'rounded-[10px]'}`} style={{ background: fill }} data-testid="swatch-chip" />;
}

/** One small tile of a swatch section: the preview, the name, and either its state or both pay actions. */
export function SwatchTile({ item, actions, avatar, note }: { item: ShopItem; actions: ShopActions; avatar: Avatar; note?: string | null }) {
  const { t, locale } = useI18n();
  const action = itemAction(item, actions, t);
  const from = item.includedWith ? loreOf(item.includedWith, locale)?.name : null;
  const line = from ? t('shop.swatch.includedWith', { name: from }) : note;
  const idle = item.forSale === false && !item.owned;

  return (
    <article data-testid="shop-item" data-item={item.key} data-kind={item.kind} data-state={item.owned ? (item.equipped ? 'equipped' : 'owned') : idle ? 'included' : 'buy'} className={`${CARD} flex min-w-0 flex-col items-center gap-1.5 p-3 ${idle ? 'opacity-70' : ''}`}>
      <SwatchPreview item={item} avatar={avatar} />
      <h3 className="line-clamp-1 w-full text-center [font:700_17px/1.1_'Barlow_Condensed'] text-[#F4EDE2]" title={item.title}>
        {item.title}
      </h3>
      {idle ? (
        <p className={`${MONO_LABEL} line-clamp-2 min-h-[2.4em] text-center !text-[10px] text-[#A0978A]`} data-testid="swatch-included">
          {line}
        </p>
      ) : action.id === 'buy' ? (
        <PayButtons item={item} action={action} testId="shop-buy" walletLabel={action.label} stack className="mt-auto" />
      ) : (
        <span className={`${BTN_SECONDARY} !min-h-9 w-full !px-1 ![font:700_12px_Inter] opacity-70`} data-testid="swatch-state">
          {action.label}
        </span>
      )}
    </article>
  );
}
