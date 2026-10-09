import { LivesHearts } from '@/components/lives/LivesHearts';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import type { ShopItem } from '@/types/shop';

const colorOf = (item: ShopItem, fallback: string): string => (typeof item.art.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(item.art.color) ? item.art.color : fallback);

/** The picture on an item card: hearts for a refill, Tera wearing the outfit, an ink drop, a frame. */
export function ShopArt({ item, lives }: { item: ShopItem; lives: { current: number; max: number } | null }) {
  if (item.kind === 'life') {
    return <LivesHearts current={lives?.max ?? 5} max={lives?.max ?? 5} size={24} label="" className="gap-1.5" data-testid="shop-art-life" />;
  }
  if (item.kind === 'outfit') {
    return (
      <span className="flex h-full items-end pb-2">
        <TeraOutfit mood="neutral" size="bubble" idle={false} outfit={item.key} />
      </span>
    );
  }
  const color = colorOf(item, '#3FD17F');
  if (item.kind === 'ink') {
    return (
      <svg width="64" height="76" viewBox="0 0 64 76" aria-hidden>
        <path d="M32 4 C44 24 56 36 56 50 a24 24 0 0 1 -48 0 C8 36 20 24 32 4 Z" fill={color} stroke="#0A0908" strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 50 a12 12 0 0 0 8 11" fill="none" stroke="#F4EDE2" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      </svg>
    );
  }
  return (
    <svg width="84" height="68" viewBox="0 0 84 68" aria-hidden>
      <rect x="3" y="3" width="78" height="62" rx="8" fill="#141210" stroke="#0A0908" strokeWidth="2" />
      <rect x="6" y="6" width="72" height="56" rx="6" fill="none" stroke={color} strokeWidth="5" />
      <rect x="15" y="15" width="54" height="38" rx="3" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 4" />
      <circle cx="42" cy="34" r="9" fill="none" stroke="#A0978A" strokeWidth="2" />
    </svg>
  );
}
