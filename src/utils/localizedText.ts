import type { Locale } from '@iterahq/activity-spec/runtime';

/**
 * A bilingual bag the way authored content actually ships it: either side may
 * be absent. This mirrors `I18nBagSchema` in `@iterahq/activity-spec`, whose
 * `pt`/`en` fields are OPTIONAL.
 */
export type PartialI18nBag = { pt?: string; en?: string };

/**
 * Resolve authored bilingual content for a locale.
 *
 * Behaviourally identical to `t()` from `@iterahq/activity-spec/runtime`, whose
 * implementation is `typeof v === 'string' ? v : (v[l] ?? v.pt)`.
 *
 * It exists because the vendored package's *declaration* for `t()` is wrong:
 * it says `t(v: I18n | string, l: Locale)` with `I18n = { pt: string; en: string }`
 * — both required — while every spec schema that feeds it (`GeneratedOption.content`,
 * `SeedCollection.prompt/example/placeholder`, …) produces `{ pt?: string; en?: string }`.
 * The runtime already copes with a missing key (that is exactly what the `??`
 * fallback is for), so the type is the part that is lying, not the code.
 *
 * Rather than assert the bags into a shape they provably do not have, this
 * wrapper states the real contract. Drop it once the vendored
 * `@iterahq/activity-spec` ships a `t()` signature that accepts a partial bag.
 *
 * The only deliberate difference: an entirely empty bag yields `''` instead of
 * `undefined`, so the declared `string` return type is honest too. Both render
 * as nothing in React, so no output changes.
 */
export function localizedText(
  v: string | PartialI18nBag | null | undefined,
  l: Locale
): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[l] ?? v.pt ?? '';
}
