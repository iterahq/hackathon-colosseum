import type { Locale } from '@/i18n';

const LOCALE_KEYS = new Set<string>(['pt', 'en']);

/**
 * The active locale, mirrored in localStorage by `I18nProvider.setLocale` on BOTH
 * paths — the user's toggle and the `useLocaleSync` hydration from
 * `itera.users.locale` — so it is a faithful copy of the provider's state.
 *
 * It is read here rather than passed in because this runs inside react-query's
 * `queryFn` (service layer), which has no React context. That makes the read
 * AMBIENT, and ambient reads do not re-run on their own: what makes the result
 * correct is that `locale` is part of the content query keys (see
 * `src/lib/queryKeys.ts`), so any locale change is a different cache entry and
 * forces this mapping to run again. Remove the locale from those keys and an
 * English learner silently keeps the Portuguese copy that was cached first.
 */
function activeLocale(): Locale {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('itera.locale')) === 'en' ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
}

/** A bilingual jsonb bag: keys are all locale codes and every value is a string. */
function isLocaleBag(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => LOCALE_KEYS.has(k) && typeof o[k] === 'string');
}

function resolveDeep(value: unknown, locale: Locale): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, locale));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (isLocaleBag(o)) return (o[locale] as string) ?? (o.pt as string) ?? (o.en as string) ?? '';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = resolveDeep(v, locale);
    return out;
  }
  return value;
}

/**
 * Collapse any bilingual `{ pt, en }` bags inside an activity spec to plain
 * strings for the active locale. Player activity components render authored spec
 * fields directly (prompts, choice labels, explanations), so a bag reaching the
 * DOM throws React error #31. Only for kinds whose runtime expects strings — the
 * `sandbox_scenario` runtime resolves its own bags and must keep them intact.
 *
 * Pass `locale` explicitly wherever one is available (a React tree has
 * `useI18n().locale`); the ambient localStorage read is the fallback for the
 * service layer. See `activeLocale` for why that is safe.
 */
export function resolveLocalizedSpec(
  spec: Record<string, unknown>,
  locale: Locale = activeLocale()
): Record<string, unknown> {
  return resolveDeep(spec, locale) as Record<string, unknown>;
}
