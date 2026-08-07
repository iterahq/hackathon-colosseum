/**
 * The package's built-in dictionary MUST agree with the Player's, verbatim.
 *
 * Fase C gave `@iterahq/activities` its own copy of the 24 activity strings so
 * a fresh consumer renders words instead of translation keys (see
 * `packages/activities/src/i18n/dictionary.ts`). A copy is a liability unless
 * something checks it, and the failure mode is not loud: the Player would keep
 * showing its own strings, the package would show stale ones, and the only
 * place the difference is visible is inside whichever app installed the
 * package — i.e. nowhere anyone on this repo is looking.
 *
 * There is a second, subtler reason this has to hold. `<ActivityProvider>` falls
 * back to these strings PER KEY when the host's `t` returns the key unchanged,
 * and any component mounted without a provider uses them wholesale. That is
 * only safe while "the package's fallback" and "what the Player would have
 * said" are the same sentence. The moment they diverge, an un-provided render
 * stops being a faithful render and starts being a plausible-looking one.
 */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ACTIVITY_DICTIONARY, ACTIVITY_I18N_KEYS } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('@iterahq/activities default dictionary', () => {
  it('carries the SAME keys in both locales', () => {
    expect(Object.keys(ACTIVITY_DICTIONARY.pt).sort()).toEqual(
      Object.keys(ACTIVITY_DICTIONARY.en).sort(),
    );
    expect([...ACTIVITY_I18N_KEYS].sort()).toEqual(Object.keys(ACTIVITY_DICTIONARY.pt).sort());
  });

  it('is scoped to activities — nothing else may sneak in', () => {
    // The package's vocabulary, not a mirror of the app's 600-key dictionary.
    for (const key of ACTIVITY_I18N_KEYS) expect(key.startsWith('activity.')).toBe(true);
  });

  it.each(['pt', 'en'] as const)('says exactly what the Player says (%s)', (locale) => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale(locale, false));

    const mismatches: string[] = [];
    for (const key of ACTIVITY_I18N_KEYS) {
      const fromApp = result.current.t(key);
      const fromPackage = ACTIVITY_DICTIONARY[locale][key];
      // A key the app does not have would come back as the key itself — that is
      // a real failure too (the package would be inventing a string), so it is
      // caught by the same comparison rather than skipped.
      if (fromApp !== fromPackage) mismatches.push(`${key}: app="${fromApp}" pkg="${fromPackage}"`);
    }
    expect(mismatches).toEqual([]);
  });
});
