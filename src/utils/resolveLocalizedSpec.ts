import type { Locale } from '@/i18n';

const LOCALE_KEYS = new Set<string>(['pt', 'en']);

/** localStorage is the locale source of truth (same key the i18n provider reads). */
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
 */
export function resolveLocalizedSpec(spec: Record<string, unknown>): Record<string, unknown> {
  return resolveDeep(spec, activeLocale()) as Record<string, unknown>;
}
