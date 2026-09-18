/**
 * The evergreen "/" brand bar as a SHAPE, ported from the design playground
 * (PR #495, `CatalogPageLab.stories.tsx`): the glyph of the "/" in Barlow
 * Condensed 700 (measured in the vendored font — height 700, stem 141, slant
 * 17.9°, corner 8), the same drawing as the bar in the ITERA/ lockup (see
 * `Logo.tsx`). It's an SVG rather than a typed "/" so the bar keeps the same
 * visual weight next to any font family — next to the eyebrow's JetBrains
 * Mono, the mono family's own "/" comes out thin and upright.
 *
 * Always evergreen `#3FD17F` — the brand never lets the slash change color,
 * so color isn't a prop. Decorative: a screen reader doesn't need to hear
 * "bar".
 */
const SLASH_PATH =
  'M23.25 0L35.67 0A0.8 0.8 0 0 1 36.43 1.05L14.28 69.45A0.8 0.8 0 0 1 13.52 70L1.1 70A0.8 0.8 0 0 1 0.34 68.95L22.49 0.55A0.8 0.8 0 0 1 23.25 0Z';

export function SlashBar({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36.77 70"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      style={{ aspectRatio: '36.77 / 70' }}
    >
      <path fill="#3FD17F" d={SLASH_PATH} />
    </svg>
  );
}
