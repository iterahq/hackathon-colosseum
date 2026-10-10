import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { SwatchTile } from './SwatchTile';

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6';

/**
 * Profile borders, backgrounds and icon colours as small swatch tiles. Renders nothing when the backend lists none,
 * so a shop without them shows no empty section (and no tab). For borders, the ones for sale come first.
 */
export function ShopBordersSlot({ items, actions, avatar, hint }: { items: readonly ShopItem[]; actions: ShopActions; avatar: LearnerAvatar; hint?: string }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => Number(b.forSale !== false) - Number(a.forSale !== false));
  return (
    <div className="flex flex-col gap-3" data-testid="shop-borders-slot">
      {hint && <p className="max-w-[640px] [font:400_13px/1.45_Inter] text-[#A0978A]">{hint}</p>}
      <div className={GRID}>
        {sorted.map((item) => (
          <SwatchTile key={item.key} item={item} actions={actions} avatar={avatar} note={item.includedWith ? t('shop.swatch.includedWith', { name: item.includedWith }) : null} />
        ))}
      </div>
    </div>
  );
}
