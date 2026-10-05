import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Itera E2E harness (tier T3 of plan
 * `20260728-itera-activity-testing`).
 *
 * MANUAL / scheduled only. It needs live apps (itera-player, itera-api,
 * dfl-learn) and real credentials, and it is deliberately NOT part of the
 * per-PR `ci.yml` gate — ADR-3 is binding. Its only home is
 * `.github/workflows/e2e.yml`. Adding viewports below is NOT a licence to move
 * Playwright into the per-PR gate.
 *
 * ## Skips are not a feature (2026-07-28)
 *
 * This header used to advertise "green-with-skips rather than red" as a virtue.
 * It was not one: the repo has never held `ITERA_SMOKE_*`, `CLAUDE_SMOKE_*` or
 * `DFL_BATCH_RESULTS_API_KEY`, so the daily cron reported success for its whole
 * life while executing essentially nothing. Tainan's criterion, verbatim:
 * **green has to mean "it ran and passed", never "it didn't run"**.
 *
 * What replaces it:
 *  - `e2e/support/capabilities.ts` — one registry, one rule: *if `e2e.yml`
 *    declares an env/secret, CI is supposed to provide it, so its absence is a
 *    FAILURE*. Everything else is optional substrate that may skip.
 *  - `e2e/preflight.spec.ts` — ONE crisp failure naming every missing
 *    secret/substrate and the fix, under `E2E_REQUIRE_CAPABILITIES=1` (set by
 *    the workflow; unset locally, so a developer without credentials keeps the
 *    old skip behaviour and is not blocked).
 *  - `e2e/support/skipCensus.reporter.ts` — every run prints what skipped and
 *    why, and FAILS a run in which zero tests executed.
 *
 * ## Viewport projects
 *
 * `desktop` runs the whole suite. `mobile` and `tablet` run ONLY the tests
 * tagged `@responsive`: instructor/route-semantics specs learn nothing from a
 * second viewport, and blindly tripling a suite that needs live apps costs real
 * money and real flakiness.
 *
 * Device picks, and why:
 *  - **Pixel 5 (393x727, chromium, isMobile + hasTouch)** — 393 CSS px is the
 *    modal Android width and the narrowest realistic phone in Playwright's
 *    catalogue, so it is the hardest overflow case. It also turns on touch, so
 *    tap-only affordances are exercised the way a learner meets them.
 *  - **iPad (gen 7) (810x1080)** — 810 is the one tablet width that matters
 *    here. `src/index.css` pins the default pixel breakpoints, so the defaults
 *    apply, and this app flips its whole live layout at `lg` (1024). 810 sits
 *    inside [md 768, lg 1024), which proves the "below lg" branch on a WIDE
 *    screen — where full-bleed layouts break most often. A 1024+ tablet would
 *    just be a second desktop. `browserName` is pinned to chromium on purpose:
 *    `npm run e2e:install` installs chromium only, and these assertions are
 *    about layout at a width, not about engine quirks — pulling in webkit would
 *    multiply the browser-install cost for no layout signal.
 *  - **Desktop Chrome (1280x720)** — the `lg+`/`xl` branch, and the baseline
 *    the suite already used.
 *
 * The three widths land in three different Tailwind buckets by construction,
 * and `e2e/responsive-shell.spec.ts` asserts exactly that so the split cannot
 * silently rot into "three desktops".
 */
export default defineConfig({
  testDir: './e2e',
  // Don't clash with vitest (which globs src/**/*.{test,spec}.*).
  testMatch: /.*\.spec\.ts$/,
  /**
   * The hermetic PR suites are a DIFFERENT contract: credential-free, built from
   * the tree under test, and BLOCKING on every PR via `ci.yml`
   * (`playwright.baseline.config.ts`). They must never be picked up here, where
   * `baseURL` points at live prod and absent capabilities turn into skips — a
   * gate that can skip is not a gate. Mirror of that config's `testMatch`.
   */
  testIgnore:
    /(activity-baseline|terminal-sandbox|feedback-footer-width|program-access|mobile-touch|source-stamp|capture-regions)\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['list'], ['./e2e/support/skipCensus.reporter.ts']]
    : [['list'], ['./e2e/support/skipCensus.reporter.ts']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.LEARN_BASE_URL || 'https://learn.devfellowship.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      grep: /@responsive/,
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
      grep: /@responsive/,
    },
  ],
});
