/**
 * storybook-story-id.ts — reproduces Storybook's own `toId(kind, name)` from
 * `@storybook/csf`, so a link to `?path=/story/<id>` can be built WITHOUT a
 * built `storybook-static/index.json` at hand (the "Nesta PR" MDX page is
 * generated *before* `build-storybook` runs — see `generate-nesta-pr-mdx.ts`).
 *
 * The sanitize regex below is copied from `@storybook/csf`'s `sanitize()` —
 * lowercase, then every space/punctuation run collapses to one hyphen, then
 * leading/trailing hyphens are trimmed. Kept in one place so both the MDX
 * generator (which cannot read the real index) and any future consumer of
 * the built index agree on the same algorithm.
 */

/** Same character class @storybook/csf uses in `sanitize()`. */
const PUNCTUATION_RE = /[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]+/g;

export function sanitizeStoryIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(PUNCTUATION_RE, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/** Storybook's `toId(kind, name)` — the same id a real Storybook build assigns. */
export function toStoryId(title: string, exportName?: string): string {
  const kind = sanitizeStoryIdPart(title);
  if (!exportName) return kind;
  return `${kind}--${sanitizeStoryIdPart(exportName)}`;
}

/**
 * Same as `toStoryId`, but honours an explicit `id:` on the CSF meta object
 * (`export default { title, id: 'activities-dispatcher' }`). Storybook uses
 * that id VERBATIM as the kind segment — it is not re-sanitized, because the
 * author already wrote a valid slug — so this must NOT fall through to
 * `sanitizeStoryIdPart(title)` when `explicitId` is set.
 */
export function toStoryIdForMeta(
  meta: { title: string; explicitId?: string },
  exportName?: string,
): string {
  const kind = meta.explicitId ?? sanitizeStoryIdPart(meta.title);
  if (!exportName) return kind;
  return `${kind}--${sanitizeStoryIdPart(exportName)}`;
}
