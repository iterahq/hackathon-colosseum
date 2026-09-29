import { Lock } from 'lucide-react';
import type { CategoryTone } from '@/types/categoryTone';

/** Band height: 40% of the tile-crossed thumbnail, clamped for narrow/wide cards. */
const BAND_HEIGHT = 'h-[clamp(112px,30cqw,136px)]';

/**
 * The recessed, lower thumbnail band: a flat category-surface fill (not the
 * old 12% gradient wash), a grid texture, a category-tinted border, and — visitor mode only — the lock badge. The icon
 * tile itself is rendered by the caller, offset to cross this band's bottom
 * edge.
 */
export function CatalogCardThumbnail({
  tone,
  locked,
}: {
  tone: CategoryTone;
  locked: boolean;
}) {
  return (
    <div
      className={`relative ${BAND_HEIGHT} overflow-hidden rounded-[14px]`}
      style={{ backgroundColor: tone.surface }}
    >
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden />
      <div
        className="absolute inset-0 rounded-[14px] border"
        style={{ borderColor: tone.edge }}
        aria-hidden
      />
      {locked && (
        <span
          data-testid="program-card-lock"
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-obsidiana/80 border border-border flex items-center justify-center text-menta"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}
