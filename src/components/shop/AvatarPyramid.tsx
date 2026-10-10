import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TIER_LORE, type LoreTier } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { supplyText } from '@/utils/avatarShop';
import { rowsOf } from './avatarRows';
import { formatCount } from './pay';
import { AvatarTile } from './AvatarTile';
import { FOCUS, MONO_LABEL, RARITY_EDGE } from './shopStyles';

const ARROW = `absolute top-[34px] z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-[#2E2A25] bg-[#141210] [font:700_16px_Inter] text-[#F4EDE2] hover:border-[#5E574E] disabled:opacity-30 sm:flex ${FOCUS}`;

/** A row is as wide as its tiles; short rows share a line, and on a phone every row takes the full width. */
const rowSize = (tiles: number) => ({ flex: `${tiles} 1 ${Math.min(tiles, 8) * 112 + 36}px` });

/** A horizontal strip: scroll-snap for touch and trackpad, arrows for the mouse, and tiles that scroll into view when focused. */
function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ start: true, end: true, hidden: 0 });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const right = el.scrollLeft + el.clientWidth;
    const hidden = Array.from(el.children).filter((c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth > right + 1).length;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1, hidden });
  }, []);
  useEffect(() => {
    measure();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  };
  const fits = edge.start && edge.end;

  return (
    <div className="relative">
      {!fits && (
        <button type="button" className={`${ARROW} -left-2`} onClick={() => go(-1)} disabled={edge.start} aria-label={`${t('shop.row.prev')}: ${label}`} data-testid="avatar-row-prev">
          ‹
        </button>
      )}
      <div ref={track} onScroll={measure} role="group" aria-label={label} data-testid="avatar-row-track" className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-1 pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {!edge.end && edge.hidden > 0 && (
        <button type="button" onClick={() => go(1)} tabIndex={-1} aria-hidden data-testid="avatar-row-more" className={`absolute right-0 top-0 z-10 rounded-full border border-[#2E2A25] bg-[#0A0908]/90 px-2 py-[1px] ${MONO_LABEL} !text-[10px] text-[#C9BFB0]`}>
          +{edge.hidden}
        </button>
      )}
      {!fits && (
        <button type="button" className={`${ARROW} -right-2`} onClick={() => go(1)} disabled={edge.end} aria-label={`${t('shop.row.next')}: ${label}`} data-testid="avatar-row-next">
          ›
        </button>
      )}
    </div>
  );
}

function Tiles({ items, actions }: { items: ShopItem[]; actions: ShopActions }) {
  const reserve = items.some((i) => (i.avatar?.includes?.length ?? 0) > 0);
  return (
    <>
      {items.map((item) => (
        <AvatarTile key={item.key} item={item} actions={actions} reserveIncludes={reserve} />
      ))}
    </>
  );
}

/** The avatars as one carousel row per rarity, rarest first; the free icons are the last row. */
export function AvatarPyramid({ items, actions }: { items: ShopItem[]; actions: ShopActions }) {
  const { t, locale } = useI18n();
  const { rows, free } = rowsOf(items);

  return (
    <div className="flex flex-wrap gap-3" data-testid="avatar-pyramid">
      {rows.map((row) => {
        const lore = row.rarity === 'primordial' ? null : TIER_LORE(row.rarity as LoreTier, locale).text;
        return (
          <section key={row.rarity} data-testid="avatar-tier" data-rarity={row.rarity} aria-label={row.tierName} className="min-w-0 max-w-full rounded-[14px] border border-[#262320] border-l-2 bg-[#141210] px-3 pb-2 pt-3 sm:px-4" style={{ borderLeftColor: RARITY_EDGE[row.rarity], ...rowSize(row.items.length) }}>
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5" title={lore ?? undefined}>
              <h3 className="[font:700_22px/1_'Barlow_Condensed'] text-[#F4EDE2]">{row.tierName}</h3>
              <span className={`${MONO_LABEL} !text-[10px]`} style={{ color: RARITY_EDGE[row.rarity] }}>{row.rarityLabel}</span>
              <span className="[font:700_12px_JetBrains_Mono] text-[#F4EDE2]" data-testid="avatar-tier-price">{row.priceShort}</span>
              {row.priceCrystals != null && <span className="[font:600_12px_JetBrains_Mono] text-[#A0978A]" data-testid="avatar-tier-crystals">{t('shop.crystals', { n: formatCount(row.priceCrystals, locale) })}</span>}
              <span className={`${MONO_LABEL} ml-auto !text-[10px] text-[#A0978A]`} data-testid="avatar-tier-supply">{row.supply.max == null ? t('shop.avatar.unlimited') : t('shop.avatar.minted', { supply: supplyText(row.supply, '') })}</span>
            </header>
            <Carousel label={row.tierName}>
              <Tiles items={row.items} actions={actions} />
            </Carousel>
          </section>
        );
      })}
      {free.length > 0 && (
        <section data-testid="avatar-free" aria-label={t('shop.avatar.free')} className="min-w-0 max-w-full rounded-[14px] border border-dashed border-[#2E2A25] px-3 pb-2 pt-3 sm:px-4" style={rowSize(free.length)}>
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="[font:700_22px/1_'Barlow_Condensed'] text-[#F4EDE2]">{t('shop.avatar.free')}</h3>
            <span className="[font:400_13px_Inter] text-[#A0978A]">{t('shop.avatar.freeHint')}</span>
          </header>
          <Carousel label={t('shop.avatar.free')}>
            <Tiles items={free} actions={actions} />
          </Carousel>
        </section>
      )}
    </div>
  );
}
