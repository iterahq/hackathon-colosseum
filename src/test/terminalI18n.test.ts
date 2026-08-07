import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';

/**
 * THE COPY GUARD FOR THE TERMINAL SANDBOX (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §3).
 *
 * ── Why a source scan and not only a render test ────────────────────────────
 * A render test proves the strings that ARE rendered are localized. It cannot
 * prove that the NEXT string someone adds will be — and the failure mode §3 is
 * about is precisely accretion: the activity shipped monolingual not by decision
 * but one convenient literal at a time. So there are two guards, and they fail
 * for different reasons:
 *
 *   • this file — no copy may live in the components at all; and every key they
 *     reference must exist in BOTH locales;
 *   • `terminalRenderedLocale.test.tsx` — the same activity, rendered twice,
 *     asserting the DOM text actually changes;
 *   • `e2e/terminal-sandbox.spec.ts` §3 — the same, in a real browser, over the
 *     built bundle, including the engine's own output.
 *
 * A test that only checks "the key exists in the dictionary" is empty
 * verification — the plan says so in as many words, and it is the failure that
 * cost 2026-08-07.
 */

const TERMINAL_DIR = 'src/components/branded/activity/terminal';

function terminalSources(): Array<{ file: string; text: string }> {
  return readdirSync(TERMINAL_DIR)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(TERMINAL_DIR, f), 'utf8') }));
}

/** Strip block and line comments — prose about i18n is not a violation of it. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('terminal i18n — no copy lives in the components', () => {
  it('finds the terminal components at all (a moved folder must not pass silently)', () => {
    const files = terminalSources().map((s) => s.file);
    expect(files).toContain('TerminalSandboxShell.tsx');
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  /**
   * The literal shape this refinement removed: `t({ pt: '…', en: '…' }, locale)`
   * inlined in JSX. It IS translated, which is exactly why it survived — but it
   * hides every user-visible string from anyone auditing what the activity says,
   * and it makes "add the string in one language for now" the path of least
   * resistance.
   */
  it('has no inline { pt, en } dictionaries left', () => {
    const offenders = terminalSources()
      .filter(({ text }) => /\{\s*pt\s*:/.test(withoutComments(text)))
      .map(({ file }) => file);
    expect(offenders, 'inline i18n literals must move to src/i18n').toEqual([]);
  });

  /**
   * Any bare quoted string with a Portuguese diacritic is copy that escaped the
   * dictionary. It is a heuristic, and deliberately a cheap one: it costs a
   * false positive at most (rename the variable, move the string), and it
   * catches the one mistake that actually happens.
   */
  it('has no accented literals outside the dictionary', () => {
    const offenders: string[] = [];
    for (const { file, text } of terminalSources()) {
      for (const m of withoutComments(text).matchAll(/(['"])((?:(?!\1).)*[àáâãçéêíóôõú][^'"]*)\1/gi)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('references only keys that exist in BOTH locales', () => {
    const missing: string[] = [];
    for (const { file, text } of terminalSources()) {
      for (const m of withoutComments(text).matchAll(/\btr\(\s*'([\w.]+)'/g)) {
        const key = m[1]!;
        if (!resources.pt[key]) missing.push(`${file}: pt is missing ${key}`);
        if (!resources.en[key]) missing.push(`${file}: en is missing ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('actually references the dictionary — the scan must not pass by finding nothing', () => {
    const keys = terminalSources().flatMap(({ text }) => [
      ...withoutComments(text).matchAll(/\btr\(\s*'([\w.]+)'/g),
    ]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
  });
});

describe('terminal i18n — the dictionary itself', () => {
  const terminalKeys = Object.keys(resources.pt).filter((k) => k.startsWith('terminal.'));

  it('has every terminal.* key in both locales', () => {
    expect(terminalKeys.length).toBeGreaterThanOrEqual(12);
    for (const key of terminalKeys) expect(resources.en[key], `en is missing ${key}`).toBeTruthy();
    for (const key of Object.keys(resources.en).filter((k) => k.startsWith('terminal.'))) {
      expect(resources.pt[key], `pt is missing ${key}`).toBeTruthy();
    }
  });

  /**
   * `bash — sandbox` is the same in both languages and should be: it is a shell
   * name, not prose. Everything else must actually differ, or the "translation"
   * is a copy-paste that will read as English to a Portuguese learner (or the
   * reverse) and no test would ever say so.
   */
  it('translates every key that is prose', () => {
    const sameInBothLanguages = new Set(['terminal.windowTitle']);
    const untranslated = terminalKeys.filter(
      (k) => !sameInBothLanguages.has(k) && resources.pt[k] === resources.en[k],
    );
    expect(untranslated).toEqual([]);
  });
});
