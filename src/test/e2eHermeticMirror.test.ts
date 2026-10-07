import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf-8');

/** Every spec name in a `key: /(a|b)\.spec\.ts$/` or `key: /a\.spec\.ts$/` of the file. */
function specNames(source: string, key: 'testMatch' | 'testIgnore'): string[] {
  const pattern = new RegExp(`${key}:\\s*\\n?\\s*/\\(?([a-z0-9|-]+)\\)?\\\\\\.spec\\\\\\.ts\\$/`, 'g');
  const names = [...source.matchAll(pattern)].flatMap((match) => match[1].split('|'));
  return [...new Set(names)];
}

/**
 * Three Playwright configs run on a substrate of their own: the baseline and
 * the stamp configs on a stubbed backend, the bring-up config on a disposable
 * stack. The production config has to ignore every spec they own: against the
 * live site their stubs and identities do not exist, and each test fails or
 * burns its full timeout. `lesson-reload` cost the weekly run five two-minute
 * failures that way; `capture-manifest` and `bringup-capture` cost it 55.
 */
describe('specs of the other substrates stay out of the production E2E run', () => {
  const ignoredInProd = specNames(read('playwright.config.ts'), 'testIgnore');

  it('reads the production list', () => {
    expect(ignoredInProd.length).toBeGreaterThan(5);
  });

  const otherConfigs = readdirSync(ROOT).filter((file) => /^playwright\..+\.config\.ts$/.test(file));

  it('finds the baseline, stamp and bring-up configs', () => {
    expect(otherConfigs).toEqual(
      expect.arrayContaining([
        'playwright.baseline.config.ts',
        'playwright.stamp.config.ts',
        'playwright.bringup.config.ts',
      ]),
    );
  });

  it.each(otherConfigs)('every spec of %s is ignored by the production config', (config) => {
    const owned = specNames(read(config), 'testMatch');
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.filter((name) => !ignoredInProd.includes(name))).toEqual([]);
  });

  it('finds a spec that is missing from the production list', () => {
    const owned = specNames('testMatch: /(lesson-reload|brand-new)\\.spec\\.ts$/,', 'testMatch');
    expect(owned.filter((name) => !ignoredInProd.includes(name))).toEqual(['brand-new']);
  });
});
