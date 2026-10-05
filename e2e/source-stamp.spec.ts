/**
 * THE `data-source` STAMP, PROVED END TO END.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROVES, AND WHY THE OBVIOUS TEST IS NOT ENOUGH
 * ═══════════════════════════════════════════════════════════════════════════
 * The obvious test is "the attribute is present". It is worth almost nothing:
 * an attribute whose value names a file that does not exist, or a line that
 * holds a different tag, is WORSE than no attribute — it sends a designer to a
 * place, confidently, and the place is wrong.
 *
 * So this suite runs a real browser against a real build with the stamp on, and
 * resolves EVERY stamp it finds against the real file tree:
 *
 *   1. the value parses as `<path>:<line>`;
 *   2. the path exists in the repository;
 *   3. the line exists in that file;
 *   4. **the tag written at that line is the tag of the DOM element that
 *      carries the stamp.**
 *
 * Step 4 is the one that makes the other three mean something. Steps 1-3 pass
 * for any stamp that names a real file — including one that is off by fifty
 * lines. Step 4 fails the moment the mapping drifts.
 *
 * Zero unresolved stamps is the pass condition. Not "few".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT STAMPED, MEASURED RATHER THAN ASSUMED
 * ═══════════════════════════════════════════════════════════════════════════
 * `@devfellowship/components` and `@iterahq/activities` are compiled before
 * Vite sees them, and Radix emits its own DOM. None of that carries a stamp,
 * by design (see `scripts/source-stamp.ts`). The capture harness resolves such
 * an element through its NEAREST STAMPED ANCESTOR — which names the file that
 * mounted the component, and is the file a designer would edit.
 *
 * So the suite also measures ANCESTOR COVERAGE: the share of rendered elements
 * that resolve to some file. It asserts a floor rather than 100%, and prints
 * the real number, because the honest claim about a map is its coverage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SCREENS
 * ═══════════════════════════════════════════════════════════════════════════
 * Public auth screens, the 404, and — through the same hermetic stub the
 * activity baseline uses — the author harness, which is the densest surface
 * reachable without a database. No credentials, no network, no live app.
 */
import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_FIXTURES,
  SINGLE_CHOICE,
  MATCH,
  DIAGRAM,
  type ActivityFixture,
} from './support/activityFixtures';
import { installHarnessSubstrate, harnessUrl } from './support/harnessStub';
import { lineOpensElement } from './support/sourceLine';

// `package.json` declares `"type": "module"`, so this file is ESM and there is
// no `__dirname`.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One rendered element that carries a stamp. */
interface StampedElement {
  /** The raw attribute value, e.g. `packages/screens/src/not-found/NotFoundScreen.tsx:28`. */
  value: string;
  /** Lowercased DOM tag name, e.g. `div`. */
  tag: string;
}

interface ScreenReport {
  screen: string;
  elements: number;
  stamped: number;
  /** Elements that are, or descend from, a stamped element. */
  resolvable: number;
  distinctFiles: number;
}

const reports: ScreenReport[] = [];

/** Read the DOM once and bring back everything the assertions need. */
async function readStamps(page: Page): Promise<{
  stamps: StampedElement[];
  elements: number;
  resolvable: number;
}> {
  return page.evaluate(() => {
    const root = document.getElementById('root') ?? document.body;
    const all = Array.from(root.querySelectorAll<HTMLElement>('*'));
    const stamps = all
      .filter((el) => el.hasAttribute('data-source'))
      .map((el) => ({
        value: el.getAttribute('data-source') as string,
        tag: el.tagName.toLowerCase(),
      }));
    const resolvable = all.filter((el) => el.closest('[data-source]') !== null).length;
    return { stamps, elements: all.length, resolvable };
  });
}

/**
 * The resolver. Kept separate from the assertions so a failure names the exact
 * stamp and the exact reason, instead of "expected 3 to be 0".
 */
function unresolved(stamps: StampedElement[]): string[] {
  const problems: string[] = [];

  for (const { value, tag } of stamps) {
    const match = /^(.+):(\d+)$/.exec(value);
    if (!match) {
      problems.push(`malformed value: ${JSON.stringify(value)}`);
      continue;
    }
    const [, relPath, lineText] = match;
    const line = Number(lineText);

    if (path.isAbsolute(relPath) || relPath.split('/').includes('..')) {
      problems.push(`not a repository-relative path: ${value}`);
      continue;
    }

    const absolute = path.join(REPO_ROOT, relPath);
    if (!existsSync(absolute)) {
      problems.push(`file does not exist: ${value}`);
      continue;
    }

    const lines = readFileSync(absolute, 'utf8').split('\n');
    if (line < 1 || line > lines.length) {
      problems.push(`line out of range (file has ${lines.length}): ${value}`);
      continue;
    }

    // The assertion that carries the weight: the source line must open the very
    // tag we found in the DOM — or, on a universal screen, the react-native
    // component that react-native-web rendered as that tag.
    if (!lineOpensElement(lines, line, tag)) {
      problems.push(
        `line does not open <${tag}>: ${value} -> ${JSON.stringify(lines[line - 1].trim())}`
      );
    }
  }

  return problems;
}

/**
 * Walk one screen and assert every stamp on it.
 *
 * `minStamped` is an anti-vacuity floor. Without it a screen that failed to
 * render would pass with a perfect score of zero unresolved stamps out of zero.
 */
async function assertScreen(page: Page, screen: string, minStamped: number): Promise<void> {
  const { stamps, elements, resolvable } = await readStamps(page);

  expect(
    stamps.length,
    `${screen}: too few stamps - did the screen render, and was the build stamped?`
  ).toBeGreaterThanOrEqual(minStamped);

  const problems = unresolved(stamps);
  expect(problems, `${screen}: ${problems.length} unresolved stamp(s)`).toEqual([]);

  const distinctFiles = new Set(stamps.map((s) => s.value.split(':')[0])).size;
  reports.push({ screen, elements, stamped: stamps.length, resolvable, distinctFiles });

  // Ancestor coverage: what share of the rendered DOM a region click can
  // resolve to a file. A floor, not a target - the printed number is the claim.
  const coverage = elements === 0 ? 0 : resolvable / elements;
  expect(coverage, `${screen}: ancestor coverage ${(coverage * 100).toFixed(1)}%`).toBeGreaterThan(
    0.5
  );
}

test.describe('data-source build stamp', () => {
  test('public auth screens resolve every stamp', async ({ page }) => {
    for (const [route, testId] of [
      ['/login', 'login-page'],
      ['/auth/forgot', undefined],
      ['/auth/code', undefined],
    ] as const) {
      await page.goto(route);
      if (testId) await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.locator('form, main, [data-source]').first()).toBeVisible();
      await assertScreen(page, route, 10);
    }
  });

  test('the 404 screen resolves every stamp', async ({ page }) => {
    await page.goto('/there-is-no-such-route');
    // The 404 is a universal screen (`packages/screens`, a lazy chunk): the app
    // shell is stamped before it mounts, so wait for the screen's own heading.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-source]').first()).toBeVisible();
    await assertScreen(page, '/there-is-no-such-route', 4);
  });

  test('the author harness resolves every stamp, on three activity kinds', async ({ page }) => {
    await installHarnessSubstrate(page, ALL_FIXTURES);

    for (const fixture of [SINGLE_CHOICE, MATCH, DIAGRAM] as ActivityFixture[]) {
      await page.goto(harnessUrl(fixture));
      await expect(page.getByTestId('activity-test-harness')).toBeVisible();
      await expect(page.getByTestId('activity-not-found')).toHaveCount(0);
      await assertScreen(page, `harness/${fixture.kind}`, 20);
    }
  });

  // Not an assertion - the coverage table, printed so that a run is readable
  // and a report can quote it. It runs last because `fullyParallel` gives each
  // test its own worker; the numbers below are whatever this worker saw.
  test.afterAll(() => {
    if (reports.length === 0) return;
    const total = reports.reduce(
      (acc, r) => ({
        elements: acc.elements + r.elements,
        stamped: acc.stamped + r.stamped,
        resolvable: acc.resolvable + r.resolvable,
      }),
      { elements: 0, stamped: 0, resolvable: 0 }
    );
    console.log('\n  screen                         elements  stamped  resolvable  files');
    for (const r of reports) {
      console.log(
        `  ${r.screen.padEnd(30)} ${String(r.elements).padStart(8)} ${String(r.stamped).padStart(8)}` +
          ` ${String(r.resolvable).padStart(11)} ${String(r.distinctFiles).padStart(6)}`
      );
    }
    console.log(
      `  ${'TOTAL'.padEnd(30)} ${String(total.elements).padStart(8)} ${String(total.stamped).padStart(8)}` +
        ` ${String(total.resolvable).padStart(11)}\n`
    );
  });
});
