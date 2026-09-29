import type { ReactNode } from 'react';

/**
 * The caller's full-width action slot (Enroll / Open / Subscribe), pinned to
 * the card's foot via `mt-auto` so it lines up on the grid row even when a
 * sibling card has no subline.
 */
export function CatalogCardActionRow({ action }: { action: ReactNode }) {
  return (
    <div className="mt-auto pt-4">
      <div className="pt-3 border-t border-border">{action}</div>
    </div>
  );
}
