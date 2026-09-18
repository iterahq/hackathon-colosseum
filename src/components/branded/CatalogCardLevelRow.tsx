import type { ReactNode } from 'react';
import { levelFor } from '@/utils/levelFor';
import { useI18n } from '@/i18n';

/**
 * Level tag + the caller's full-width action slot (Enroll / Open / Subscribe),
 * pinned to the card's foot via `mt-auto` on the caller so it lines up on the
 * grid row even when a sibling card has no subline.
 */
export function CatalogCardLevelRow({
  activityCount,
  action,
}: {
  activityCount: number;
  action: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-auto pt-4">
      <div className="pt-3 border-t border-border font-mono text-[11px] uppercase tracking-wider text-foreground/60">
        {t(`level.${levelFor(activityCount)}`)}
      </div>
      <div className="mt-3">{action}</div>
    </div>
  );
}
