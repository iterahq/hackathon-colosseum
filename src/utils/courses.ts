/** Shared helpers of the program page and its dashboard links: accent color, glyph and trail deep links. */
import { ACCENT_COLORS } from '@/utils/trailDashboard';

/** Stable accent of a course: the program page and the video courses agree without sharing a list. */
export function courseColorIndex(slug: string): number {
  let sum = 0;
  for (const ch of slug) sum += ch.charCodeAt(0);
  return sum % ACCENT_COLORS.length;
}

export const courseColor = (slug: string) => ACCENT_COLORS[courseColorIndex(slug)];

/** Three-letter mono glyph of a course. */
export const glyphOf = (slug: string): string => slug.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || '···';

const TRAIL_HASH = '#trail-';

/** Deep link to one trail (unit) on the course page. */
export const trailHref = (programSlug: string, unitId: string): string => `/program/${programSlug}${TRAIL_HASH}${unitId}`;

/** The unit a URL hash points at, when one of `unitIds` matches. */
export function trailIdFromHash(hash: string, unitIds: readonly string[]): string | null {
  if (!hash.startsWith(TRAIL_HASH)) return null;
  let id = hash.slice(TRAIL_HASH.length);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return unitIds.includes(id) ? id : null;
}
