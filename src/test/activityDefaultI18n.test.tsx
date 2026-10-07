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
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ACTIVITY_DICTIONARY, ACTIVITY_I18N_KEYS } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

const PACKAGE_SRC = path.resolve(__dirname, '../../packages/activities/src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name) ? [full] : [];
  });
}

const KEY_PREFIXES = ['activity.', 'terminal.', 'chat.', 'code.', 'quiz.'];

/**
 * The key-shaped string literals written inside a `t(...)` or `tr(...)` call,
 * one level of nested parentheses and both branches of a ternary included.
 * An alarm for literal keys only: a key built from a template, read from a
 * map or passed in a variable is not seen.
 */
function requestedKeys(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/\b(?:t|tr)\(((?:[^()]|\([^()]*\))*)/g)].flatMap((call) =>
    [...call[1].matchAll(/['"`]([a-z]+\.[A-Za-z0-9_.]+)['"`]/g)]
      .map((literal) => literal[1])
      .filter((key) => KEY_PREFIXES.some((prefix) => key.startsWith(prefix))),
  );
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
    //
    // A CLOSED ALLOWLIST, not a single prefix. `terminal.*` joined in Fase C
    // step 4 with the terminal sandbox, whose 15 keys were pulled out of inline
    // `{ pt, en }` literals two days earlier by
    // `20260807-itera-terminal-sandbox-refinamentos` §3. Renaming them on the
    // way into the package would have undone that rename and desynchronised
    // this dictionary from the Player's — the one thing it may not do.
    //
    // `code.*` joined in Fase C step 5 for the same reason `terminal.*` did:
    // the fifteen keys already exist under that name in the Player, and
    // renaming them on the way into the package would desynchronise the two
    // dictionaries — which is precisely what the third assertion in this file
    // exists to prevent. They are in the BASE dictionary although the kind
    // itself is behind `@iterahq/activities/code`, because the per-key fallback
    // lives in the base provider: splitting the dictionary per entrypoint would
    // hand every `/code` consumer a dictionary-merging chore.
    //
    // `quiz.` joined in Fase D, and it is ONE key — `quiz.trueOrFalse`, the
    // eyebrow above a two-option question. The argument the previous paragraph
    // demanded, made: the Player has shipped that key under that name since
    // before any of this was a package, and renaming it to
    // `activity.quiz.trueOrFalse` on the way in would buy a tidier namespace at
    // the price of the exact divergence the third assertion in this file exists
    // to prevent. If it is ever to be folded into `activity.`, the rename
    // happens in the PLAYER first and the package follows.
    //
    // Keep this list SHORT and keep the assertion exact-match rather than
    // "contains a dot": the point is that a namespace has to be argued for in a
    // review, not that keys look tidy.
    //
    // `chat.` joined on 2026-08-10 with the live-class chat mirror, and it is
    // the argument this list asks for, made: it is the KIND namespace of
    // `chat_sandbox`, exactly parallel to `terminal.` two lines up, and the two
    // kinds were split out of one enum value — giving one a namespace and
    // folding the other into `activity.` would make the pair asymmetric for no
    // reason a reader could reconstruct. Both current keys (`chat.mirror.*`) are
    // the read-only mirror's strings, and their `terminal.mirror.*` twins live
    // under `terminal.` already.
    const strays = ACTIVITY_I18N_KEYS.filter((k) => !KEY_PREFIXES.some((p) => k.startsWith(p)));
    expect(strays).toEqual([]);
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

  // The three cases above compare the dictionary with the Player's. None of
  // them notices a string a component asks for and the package never had: the
  // Player answers it, and any other consumer prints the key.
  it('has every literal key a package component asks for', () => {
    const missing = sourceFiles(PACKAGE_SRC).flatMap((file) =>
      requestedKeys(readFileSync(file, 'utf-8'))
        .filter((key) => !(key in ACTIVITY_DICTIONARY.en))
        .map((key) => `${key} (${path.relative(PACKAGE_SRC, file)})`),
    );
    expect(missing).toEqual([]);
  });

  it('reads the keys of a call and nothing else', () => {
    expect(requestedKeys("t(done ? 'activity.sent' : 'activity.send', { n })")).toEqual([
      'activity.sent',
      'activity.send',
    ]);
    expect(requestedKeys("tr(isTouch() ? 'terminal.tap' : 'terminal.type')")).toEqual(['terminal.tap', 'terminal.type']);
    expect(requestedKeys("t('index.html', locale);\n  // t('code.gone')\n/* t('code.gone') */")).toEqual([]);
    expect(sourceFiles(PACKAGE_SRC).length).toBeGreaterThan(100);
  });
});
