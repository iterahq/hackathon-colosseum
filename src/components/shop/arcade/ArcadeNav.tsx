import { Award, CircleDashed, Glasses, Heart, PaintBucket, Smartphone, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import { SECTION_ID } from '../ShopTabs';
import { FOCUS } from '../shopStyles';
import type { ArcadeCategory, ArcadeShelf } from './arcadeModel';

const ICON: Record<ArcadeCategory, LucideIcon> = { avatars: UserRound, lives: Heart, borders: CircleDashed, outfits: Glasses, certs: Award, backgrounds: PaintBucket, icons: Smartphone, more: Sparkles };
const LABEL: Record<ArcadeCategory, string> = { avatars: 'shop.nav.avatars', lives: 'shop.nav.lives', borders: 'shop.nav.borders', outfits: 'shop.nav.clothes', certs: 'shop.nav.certs', backgrounds: 'shop.nav.backgrounds', icons: 'shop.nav.icons', more: 'arcade.more' };

export const categoryLabel = (id: ArcadeCategory): string => LABEL[id];
export const tabId = (id: ArcadeCategory): string => (id === 'more' ? 'shop-more-tab' : `${SECTION_ID[id]}-tab`);
export const panelId = (id: ArcadeCategory): string => (id === 'more' ? 'shop-more' : SECTION_ID[id]);

interface Props {
  shelves: ArcadeShelf[];
  active: ArcadeCategory;
  onChange: (id: ArcadeCategory) => void;
  /** Whether the "Extras" entry is offered after the shelves. */
  extras?: boolean;
}

/** The categories: a rail with collection progress on a wide screen, a sticky strip of icon tabs on a phone. */
export function ArcadeNav({ shelves, active, onChange, extras = true }: Props) {
  const { t } = useI18n();
  const entries: { id: ArcadeCategory; owned: number | null; total: number }[] = extras ? [...shelves, { id: 'more', owned: null, total: 0 }] : [...shelves];

  return (
    <nav aria-label={t('shop.nav.label')} data-testid="shop-sections" className="sticky top-0 z-20 -mx-4 border-b border-[#262320] bg-[#0A0908]/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div role="tablist" aria-label={t('shop.nav.label')} aria-orientation="vertical" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] max-lg:[mask-image:linear-gradient(90deg,#000_calc(100%-32px),transparent)] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {entries.map(({ id, owned, total }) => {
          const Icon = ICON[id];
          const selected = id === active;
          const percent = owned != null && total > 0 ? Math.round((owned / total) * 100) : null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={selected}
              aria-controls={panelId(id)}
              onClick={() => onChange(id)}
              data-testid={`shop-section-${id}`}
              className={`relative flex min-h-11 flex-none items-center gap-2 overflow-hidden rounded-[12px] border px-3 text-left lg:min-h-[46px] lg:w-full ${selected ? 'border-[#3FD17F] bg-[#3FD17F]/10 text-[#F4EDE2]' : 'border-[#262320] bg-[#141210] text-[#C9BFB0] hover:border-[#5E574E] hover:text-[#F4EDE2]'} ${FOCUS}`}
            >
              <Icon size={18} className={`flex-none ${selected ? 'text-[#3FD17F]' : 'text-[#A0978A]'}`} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="whitespace-nowrap [font:700_14px/1.2_Inter]">{t(LABEL[id])}</span>
                {percent != null && (
                  <span aria-hidden className="mt-1 hidden h-[3px] w-full overflow-hidden rounded-full bg-[#262320] lg:block">
                    <span className="block h-full rounded-full bg-[#3FD17F]" style={{ width: `${percent}%` }} />
                  </span>
                )}
              </span>
              {owned != null && (
                <span className="flex-none [font:700_11px_JetBrains_Mono] tabular-nums text-[#A0978A]" data-testid="shop-section-count" title={t('arcade.collection')}>
                  {owned}/{total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
