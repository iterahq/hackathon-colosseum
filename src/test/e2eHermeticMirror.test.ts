import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf-8');

/** The spec names inside the first `/(a|b|c)\.spec\.ts$/` after `key:`. */
function specNames(source: string, key: 'testMatch' | 'testIgnore'): string[] {
  const match = new RegExp(`${key}:\\s*\\n?\\s*/\\(([^)]+)\\)\\\\\\.spec\\\\\\.ts\\$/`).exec(source);
  return match ? match[1].split('|') : [];
}

/**
 * The hermetic baseline specs run against a stubbed backend. The production
 * config has to ignore every one of them: against the live site their stubs do
 * nothing, and each test burns its full timeout before failing. `lesson-reload`
 * was added to the first list and not the second, and cost the weekly run five
 * two-minute failures.
 */
describe('hermetic specs stay out of the production E2E run', () => {
  const hermetic = specNames(read('playwright.baseline.config.ts'), 'testMatch');
  const ignoredInProd = specNames(read('playwright.config.ts'), 'testIgnore');

  it('reads both lists', () => {
    expect(hermetic.length).toBeGreaterThan(5);
    expect(ignoredInProd.length).toBeGreaterThan(5);
  });

  it('every baseline spec is ignored by the production config', () => {
    expect(hermetic.filter((name) => !ignoredInProd.includes(name))).toEqual([]);
  });
});
