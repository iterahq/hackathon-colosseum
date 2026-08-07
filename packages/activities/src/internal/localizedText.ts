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

const LOCALE_KEYS = new Set<string>(['pt', 'en']);

/** A bilingual jsonb bag: keys are all locale codes and every value is a string. */
export function isLocaleBag(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => LOCALE_KEYS.has(k) && typeof o[k] === 'string');
}

/**
 * Resolve ONE authored text field that may arrive in either legitimate shape:
 * a plain string, or a `{ pt, en }` bag. Returns `null` — not `''` — when the
 * value is neither, so a caller can tell "the author wrote nothing" apart from
 * "the author wrote an empty string" and refuse to render a card either way.
 *
 * Fallback order is `active locale → pt → en`. `pt` comes first because it is
 * the product default and the language every row was authored in before the EN
 * backfill — an EN reader looking at a bag that only carries `pt` is better
 * served by the Portuguese sentence the author actually wrote than by a blank
 * panel.
 *
 * ⚠️ THIS IS THE ONLY IMPLEMENTATION. It arrived in the app with #309, where its
 * own docblock warned that re-deriving the fallback order at a call site is how
 * an EN reader ends up seeing a different sentence depending on which component
 * rendered it. Fase C moved `AnswerExplanation` into this package the same day,
 * which would have made that warning come true — so the function moved with it
 * and `@/utils/resolveLocalizedSpec` re-exports this one rather than keeping a
 * twin. `resolveLocalizedSpec.test.ts` still guards it from the app side.
 *
 * `Locale` here is the runtime locale of `@iterahq/activity-spec`, which is the
 * same `'pt' | 'en'` the app's `@/i18n` declares.
 */
export function resolveLocalizedText(value: unknown, locale: Locale): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (isLocaleBag(o)) return (o[locale] as string) ?? (o.pt as string) ?? (o.en as string) ?? null;
  }
  return null;
}
