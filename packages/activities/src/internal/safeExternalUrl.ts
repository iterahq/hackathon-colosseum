/**
 * An author-supplied link, reduced to something safe to put in an `href`.
 *
 * `z.string().url()` accepts `javascript:alert(1)` — it validates the URL shape,
 * not the scheme. Every authored link is a reference the learner is meant to open
 * in a new tab, so http(s) is the whole legitimate surface and anything else is
 * either a mistake or an attempt.
 *
 * Returns `undefined` for a rejected link, so the caller drops the anchor
 * instead of rendering one that does nothing when tapped.
 */
export function safeExternalUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
