/**
 * Splits a "Headline: subline" (or "Headline — subline") course title into
 * two layers, ported from the design playground (PR #495,
 * `CatalogPageLab.stories.tsx`).
 *
 * Only splits with BOTH halves present and a space after the separator (so
 * "10:30" doesn't get split). A title with no subline is returned whole as
 * the headline.
 */
import type { SplitTitle } from '@/types/splitTitle';

export type { SplitTitle };

const SEPARATOR = /^(.+?)(?::\s+|\s+[—–]\s+)(.+)$/;

export function splitTitle(title: string): SplitTitle {
  const match = title.match(SEPARATOR);
  if (!match) return { headline: title, subline: null };
  return { headline: match[1].trim(), subline: match[2].trim() };
}
