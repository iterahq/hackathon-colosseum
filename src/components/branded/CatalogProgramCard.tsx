/**
 * The shared v3 catalog card — promoted from the design playground (PR #495,
 * `CatalogPageLab.stories.tsx`, "Proposta v3": the v2 layout with the
 * `PALETTE_V3` colours). Renders the recessed thumbnail band, the 88px flat
 * icon tile crossing its edge, the large colored title, the meta row, the
 * level tag and the caller's `action` slot.
 *
 * ONE presentational card shared by both catalog surfaces: `CatalogCard`
 * (member — Enroll/Open, wired to `useEnroll`) and `LockedCatalogCard`
 * (visitor — a `/subscribe` link, no mutation). Neither surface duplicates
 * the layout; they only supply `action` and `locked`.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CatalogCardThumbnail } from './CatalogCardThumbnail';
import { CategoryTile } from './CategoryTile';
import { CatalogCardTitle } from './CatalogCardTitle';
import { CatalogCardMeta } from './CatalogCardMeta';
import { CatalogCardLevelRow } from './CatalogCardLevelRow';
import { toneFor } from './catalogCardPalette';
import { splitTitle } from '@/utils/splitTitle';
import { useI18n } from '@/i18n';
import type { CatalogProgramCardData } from '@/types/catalogProgramCardData';

export function CatalogProgramCard({
  program,
  action,
  locked = false,
  onOpenThumbnail,
}: {
  program: CatalogProgramCardData;
  /** Full-width CTA (Enroll / Open / Subscribe), rendered under the level tag. */
  action: ReactNode;
  /** Visitor mode: shows the lock badge over the thumbnail. Purely visual. */
  locked?: boolean;
  /** When set, the thumbnail becomes a button (e.g. open the enrolled course). */
  onOpenThumbnail?: () => void;
}) {
  const { tText } = useI18n();
  const { headline, subline } = splitTitle(tText(program.title));
  const tone = toneFor(program.icon);

  const thumbnail = <CatalogCardThumbnail icon={program.icon} tone={tone} locked={locked} />;

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      data-testid="catalog-program-card"
      className="group relative flex flex-col text-left rounded-3xl p-2.5 bg-card border border-border hover:border-verde-tech/50 transition-colors [container-type:inline-size]"
    >
      {onOpenThumbnail ? (
        <button type="button" aria-label={headline} onClick={onOpenThumbnail} className="block w-full rounded-[14px] text-left">
          {thumbnail}
        </button>
      ) : (
        thumbnail
      )}

      <div className="flex flex-1 flex-col px-3 pb-2">
        <div className="relative -mt-11 mb-4 self-start">
          <CategoryTile icon={program.icon} accent={tone.accent} />
        </div>
        <CatalogCardTitle headline={headline} subline={subline} tone={tone} />
        <CatalogCardMeta program={program} />
        <CatalogCardLevelRow activityCount={program.activityCount ?? 0} action={action} />
      </div>
    </motion.div>
  );
}
