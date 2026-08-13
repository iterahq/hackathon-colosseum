/**
 * THE CAPTURE, PROVED — `screenshot.png` + `regions.json`, and a click that
 * lands on the right file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT EACH TEST BUYS
 * ═══════════════════════════════════════════════════════════════════════════
 * `e2e/source-stamp.spec.ts` already proves the STAMP resolves. This suite is
 * about the map built from it, and it asserts three different things:
 *
 *  1. **The pair is written, and the map is not empty.** A capture that
 *     produced an image and zero regions would be a screenshot, not a map.
 *  2. **A COORDINATE resolves to the right file.** This is the product claim,
 *     end to end. It is checked against a box Playwright measured itself
 *     (`locator.boundingBox()`), never against the collector's own numbers —
 *     asking the map to confirm the map would prove nothing.
 *  3. **Two captures of one screen are BYTE-IDENTICAL.** This is the real test
 *     of pixel stability, and it is the only one that can fail for the reason
 *     that matters downstream: everything after this compares two screenshots
 *     and asks whether the diff reached zero. If capture #1 and capture #2 of
 *     an UNCHANGED screen already differ, that question has no answer.
 *
 * Test 3 uses two FRESH BROWSER CONTEXTS, not two shots of one page. A second
 * shot of a page that is already settled is the easy case; a second context
 * boots the app again, re-runs its effects, re-requests its fonts and re-draws
 * from nothing. That is the case a real capture run performs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ ONE MACHINE, NOT TWO
 * ═══════════════════════════════════════════════════════════════════════════
 * Byte-identity is asserted between two captures on ONE host, in one run. Glyph
 * rasterisation belongs to the host's FreeType/fontconfig, so a cross-machine
 * comparison is not promised here and must not be read into a green run. The
 * limits are enumerated in the header of `e2e/support/captureRegions.ts`.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  CAPTURE_CONTEXT_OPTIONS,
  REPO_ROOT,
  captureScreen,
  freezeForCapture,
  resolveRegionAt,
  type CaptureResult,
  type Region,
} from './support/captureRegions';
import { ALL_FIXTURES, SINGLE_CHOICE } from './support/activityFixtures';
import { harnessUrl, installHarnessSubstrate } from './support/harnessStub';

/** Generated output. Gitignored — the PR links uploaded copies instead. */
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'e2e', 'artifacts', 'regions');

/**
 * One capturable screen. `prepare` stands up whatever substrate the route
 * needs, `settleHint` is a locator that must be visible before the shot — an
 * anti-vacuity guard, so a screen that failed to render cannot pass with a
 * perfect map of nothing.
 */
interface Screen {
  name: string;
  url: string;
  minRegions: number;
  prepare?: (page: Page) => Promise<void>;
  settleHint: string;
}

const SCREENS: Screen[] = [
  { name: 'login', url: '/login', minRegions: 10, settleHint: '[data-testid="login-page"]' },
  { name: 'not-found', url: '/there-is-no-such-route', minRegions: 4, settleHint: 'h1' },
  {
    name: 'harness-single-choice',
    url: harnessUrl(SINGLE_CHOICE),
    minRegions: 20,
    prepare: (page) => installHarnessSubstrate(page, ALL_FIXTURES),
    settleHint: '[data-testid="activity-test-harness"]',
  },
];

/**
 * Boot one screen in a page that is already frozen, and capture it.
 *
 * `freezeForCapture` must run before the first navigation — `addInitScript`
 * only reaches documents created after it is installed.
 */
async function captureInto(page: Page, screen: Screen, outDir: string): Promise<CaptureResult> {
  await freezeForCapture(page);
  if (screen.prepare) await screen.prepare(page);
  await page.goto(screen.url);
  await expect(page.locator(screen.settleHint).first()).toBeVisible();
  return captureScreen(page, { outDir, screen: screen.name });
}

/** The same, in a context of its own, so nothing carries over between runs. */
async function captureInFreshContext(
  browser: Browser,
  screen: Screen,
  outDir: string
): Promise<CaptureResult> {
  // A stale pair from a previous run must never be mistaken for this run's
  // output — above all by the byte-identity test. Scoped to the one directory
  // this call owns, so parallel workers do not delete each other's artifacts.
  await rm(outDir, { recursive: true, force: true });
  const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
  try {
    return await captureInto(await context.newPage(), screen, outDir);
  } finally {
    await context.close();
  }
}

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

/**
 * Every region must name a file that exists, a line inside it, and — the check
 * that carries the weight — a line that opens the tag the region carries.
 * Steps one and two pass for a stamp that is off by fifty lines.
 */
function unresolved(regions: Region[]): string[] {
  const problems: string[] = [];
  const cache = new Map<string, string[] | null>();

  for (const region of regions) {
    if (path.isAbsolute(region.file) || region.file.split('/').includes('..')) {
      problems.push(`not a repository-relative path: ${region.file}`);
      continue;
    }
    if (!cache.has(region.file)) {
      const abs = path.join(REPO_ROOT, region.file);
      cache.set(region.file, existsSync(abs) ? readFileSync(abs, 'utf8').split('\n') : null);
    }
    const lines = cache.get(region.file);
    if (!lines) {
      problems.push(`file does not exist: ${region.file}`);
      continue;
    }
    if (region.line < 1 || region.line > lines.length) {
      problems.push(`line out of range (file has ${lines.length}): ${region.file}:${region.line}`);
      continue;
    }
    if (!lines[region.line - 1].includes(`<${region.tag}`)) {
      problems.push(
        `line does not open <${region.tag}>: ${region.file}:${region.line} -> ` +
          JSON.stringify(lines[region.line - 1].trim())
      );
    }
  }
  return problems;
}

test.describe('screenshot regions capture', () => {
  for (const screen of SCREENS) {
    test(`captures ${screen.name} as screenshot.png + regions.json`, async ({ browser }) => {
      const result = await captureInFreshContext(
        browser,
        screen,
        path.join(ARTIFACT_ROOT, screen.name)
      );

      expect(existsSync(result.pngPath), 'screenshot.png was written').toBe(true);
      expect(existsSync(result.jsonPath), 'regions.json was written').toBe(true);
      // A PNG is at least a signature and a header; anything tiny means the
      // shot failed silently.
      expect(result.png.byteLength).toBeGreaterThan(1024);

      const manifest = result.manifest;
      expect(manifest.version).toBe(1);
      expect(manifest.screen).toBe(screen.name);
      expect(manifest.devicePixelRatio, 'dpr must be 1 so CSS px == image px').toBe(1);
      expect(manifest.scroll).toEqual({ x: 0, y: 0 });

      expect(
        manifest.regions.length,
        `${screen.name}: too few regions — did the screen render, and was the build stamped?`
      ).toBeGreaterThanOrEqual(screen.minRegions);

      const problems = unresolved(manifest.regions);
      expect(problems, `${screen.name}: ${problems.length} unresolved region(s)`).toEqual([]);

      // Every region must be inside the frame the image actually shows, or a
      // click on the image cannot mean it.
      for (const region of manifest.regions) {
        expect(region.rect.width).toBeGreaterThan(0);
        expect(region.rect.height).toBeGreaterThan(0);
        expect(region.rect.x).toBeLessThan(manifest.viewport.width);
        expect(region.rect.y).toBeLessThan(manifest.viewport.height);
      }

      // The map is only useful if a region can be reached by a click. The
      // deepest region on the screen is the strictest witness of that.
      const deepest = [...manifest.regions].sort((a, b) => a.area - b.area)[0];
      const hit = resolveRegionAt(
        manifest.regions,
        deepest.rect.x + deepest.rect.width / 2,
        deepest.rect.y + deepest.rect.height / 2
      );
      expect(hit, 'the centre of a region resolves to a region').not.toBeNull();

      const files = new Set(manifest.regions.map((r) => r.file));
      const named = manifest.regions.filter((r) => r.componentName.length > 0).length;
      expect(named, 'every region carries a component name').toBe(manifest.regions.length);
      console.log(
        `  ${screen.name.padEnd(24)} ${String(manifest.regions.length).padStart(4)} regions  ` +
          `${String(files.size).padStart(3)} files  ` +
          `dropped ${manifest.dropped.zeroArea} zero-area / ${manifest.dropped.offscreen} offscreen`
      );
    });
  }

  /**
   * THE PRODUCT CLAIM, END TO END.
   *
   * `src/pages/NotFound.tsx` is the witness because it is twenty-six lines
   * long, has exactly one component and one `<h1>`, and reaches the screen with
   * no substrate at all — so a failure here is about the map and nothing else.
   */
  test('a coordinate inside a known component resolves to its exact file', async ({ browser }) => {
    const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
    const page = await context.newPage();
    const screen = SCREENS.find((s) => s.name === 'not-found')!;

    await freezeForCapture(page);
    await page.goto(screen.url);
    await expect(page.locator('h1')).toBeVisible();

    const outDir = path.join(ARTIFACT_ROOT, 'proof-not-found');
    const { manifest } = await captureScreen(page, { outDir, screen: 'not-found' });

    // The coordinate comes from PLAYWRIGHT's own measurement of the heading,
    // not from the manifest. That independence is the point of the test.
    const box = await page.locator('h1').boundingBox();
    expect(box, 'the heading has a box').not.toBeNull();
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    const hit = resolveRegionAt(manifest.regions, point.x, point.y);
    expect(hit, `nothing resolves at (${point.x}, ${point.y})`).not.toBeNull();
    expect(hit!.file).toBe('src/pages/NotFound.tsx');
    expect(hit!.tag).toBe('h1');
    expect(hit!.componentName).toBe('NotFound');

    // And the named line really is the `<h1>` — the assertion that stops the
    // map from being confidently wrong.
    const source = readFileSync(path.join(REPO_ROOT, hit!.file), 'utf8').split('\n');
    expect(source[hit!.line - 1]).toContain('<h1');

    // A point outside every region must answer NOTHING rather than guess. That
    // is what stops a viewer from reporting a file for empty canvas.
    expect(resolveRegionAt(manifest.regions, -5, -5)).toBeNull();

    // And a point that IS inside the page but not inside the heading must
    // resolve to something else. The 404 shell is `min-h-screen`, so the
    // bottom-right corner is inside the shell and outside the card — the
    // honest answer there is the shell, never the `<h1>`.
    const corner = resolveRegionAt(
      manifest.regions,
      manifest.viewport.width - 1,
      manifest.viewport.height - 1
    );
    expect(corner, 'the shell covers the whole viewport').not.toBeNull();
    expect(corner!.tag).not.toBe('h1');

    console.log(
      `  click (${Math.round(point.x)}, ${Math.round(point.y)}) -> ` +
        `${hit!.componentName} @ ${hit!.file}:${hit!.line} <${hit!.tag}>`
    );
    await context.close();
  });

  /**
   * PIXEL STABILITY. Two fresh contexts, one screen, no change in between.
   * The bytes must match exactly — not "look similar", not "diff under N".
   *
   * EVERY screen, not one. The 404 alone would be the easy case: static text,
   * no form, no fixture. `login` carries focusable inputs (a blinking caret is
   * the classic churn) and `harness-single-choice` mounts a whole activity
   * through the stub. A rule proved only on the simplest screen is not the rule
   * downstream needs.
   */
  for (const screen of SCREENS) {
    test(`${screen.name} captured twice is byte-identical`, async ({ browser }) => {
      const dirA = path.join(ARTIFACT_ROOT, 'stability', screen.name, 'a');
      const dirB = path.join(ARTIFACT_ROOT, 'stability', screen.name, 'b');

      const a = await captureInFreshContext(browser, screen, dirA);
      const b = await captureInFreshContext(browser, screen, dirB);

      const hashA = sha256(a.png);
      const hashB = sha256(b.png);
      console.log(`  ${screen.name.padEnd(24)} A ${hashA}\n  ${' '.repeat(24)} B ${hashB}`);

      expect(a.png.byteLength, 'both captures produced the same number of bytes').toBe(
        b.png.byteLength
      );
      expect(hashB, 'two captures of an unchanged screen must be byte-identical').toBe(hashA);

      // `regions.json` must be stable too, or the pair diff is noisy even when
      // the image is clean. `capturedAt` is frozen precisely so this can hold.
      expect(readFileSync(b.jsonPath, 'utf8')).toBe(readFileSync(a.jsonPath, 'utf8'));
    });
  }
});
