import { categoryFor } from '@/components/branded/ProgramIcon';

/**
 * The catalog card's category eyebrow label. On the card the brand slash bar
 * already means "topic", so "AI / ML" next to it would read as two slashes —
 * the category's own internal separator becomes "·" instead (ported from
 * design-playground PR #495).
 */
export function categoryLabel(icon?: string): string {
  return categoryFor(icon).label.replace(' / ', ' · ');
}
