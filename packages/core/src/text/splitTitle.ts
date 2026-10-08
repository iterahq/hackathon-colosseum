/** A "Headline: subline" course title as two layers. */
export interface SplitTitle {
  headline: string;
  subline: string | null;
}

const SEPARATOR = /^(.+?)(?::\s+|\s+[—–]\s+)(.+)$/;

/**
 * Splits "Headline: subline" (or "Headline — subline"). Only with both halves present and a space after
 * the separator, so "10:30" stays whole. A title with no subline is the headline.
 */
export function splitTitle(title: string): SplitTitle {
  const match = title.match(SEPARATOR);
  if (!match) return { headline: title, subline: null };
  return { headline: match[1].trim(), subline: match[2].trim() };
}
