import { defineConfig, devices } from '@playwright/test';
import { CAPTURE_LAUNCH_ARGS } from './e2e/support/captureRegions';

/**
 * Playwright config for the `data-source` STAMP and for the CAPTURE built on it
 * (P4 of plan `20260812-ux-map-observed-reality-lens`).
 *
 * ## Why a third config
 *
 * There are already two, and each encodes a different substrate:
 * `playwright.config.ts` drives live prod with credentials, and
 * `playwright.baseline.config.ts` drives a hermetic `vite preview` of this tree.
 * These suites need the hermetic substrate — but built with
 * `ITERA_SOURCE_STAMP=1`, which the baseline must NOT have.
 *
 * That is the whole reason for the split, and it is not cosmetic. The
 * characterization baseline exists to say "the behaviour of the code in this
 * tree did not move". Building it with a non-default flag would make it
 * characterize an artifact that never ships. So the flag lives here, in a
 * config whose only job is to prove the flag works, and the baseline keeps
 * measuring the default build.
 *
 * ## Two projects, ONE server
 *
 * | project   | spec                       | what it answers                     |
 * |-----------|----------------------------|-------------------------------------|
 * | `stamp`   | `source-stamp.spec.ts`     | does every stamp name a real file?  |
 * | `capture` | `capture-regions.spec.ts`  | does the MAP built from the stamps place a click on the right file, and does the image repeat byte for byte? |
 *
 * They are projects rather than a fourth config on purpose: the dominant cost
 * here is the `vite build` inside `webServer`, and one server serves both. The
 * cheap-looking alternative — a `playwright.capture.config.ts` on port 4190 —
 * would build the same tree with the same flag a second time on every PR.
 *
 * ⚠️ That saving only exists if BOTH projects run in ONE invocation, which is
 * why `npm run e2e:stamp` passes no `--project` and CI calls it exactly once.
 * `reuseExistingServer` is FALSE under `CI`, so two `--project` calls would
 * start two servers and pay for two builds — the whole reason the split was
 * avoided. `npm run e2e:capture` narrows to one project for LOCAL iteration,
 * where the server is reused and the saving does not apply.
 *
 * ⚠️ **The determinism settings are NOT in this file.** They live in
 * `CAPTURE_CONTEXT_OPTIONS` (`e2e/support/captureRegions.ts`) and the capture
 * spec applies them by opening its own `browser.newContext()`. A real capture
 * run will be a script rather than a test, and it will make exactly that call —
 * so the suite exercises the object the tool will use instead of a
 * config-shaped copy of it. It also keeps `stamp` walking the DOM of an
 * ORDINARY browser, where an attribute that only survives a frozen one is
 * caught rather than blessed.
 *
 * Port 4189, one above the baseline's 4188, so the two can run at once on a
 * developer machine and on a shared self-hosted runner.
 *
 * `--host 127.0.0.1` is deliberate: `vite preview` binds `0.0.0.0` by default,
 * which on a public VPS publishes the preview — and this particular preview
 * contains the private repository layout. Loopback only.
 */
export default defineConfig({
  testDir: './e2e',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The assertions are pure functions of the DOM and the file tree. A retry
  // could only hide a real failure.
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  /**
   * 🚨 ONE constant for every test here, so **no test in this config may cost
   * O(n)** in anything the manifest can grow.
   *
   * That rule is written down because breaking it already cost a day. The
   * `manifest` project arrived on 2026-08-13 with a test that walked 24 gated
   * routes in ONE `for` loop. Its median on the runner was 23.8s and its worst
   * green was 42.5s, against this 45s — so it went red 8 times in 39 executions
   * with `Test timeout of 45000ms exceeded`, and passed every re-run at the
   * same SHA. It is a SECURITY gate (see `capture-manifest.spec.ts`), and a
   * security gate that reds on timing teaches people to re-run it.
   *
   * The fix was to split that walk into one test per route, NOT to raise this
   * number: raising it moves the cliff to the next route added. Write a walk as
   * `for (const entry of …) test(…)`, never as `test(… for (const entry of …))`.
   *
   * ⚠️ `retries` stays 0 for the same reason. A retry would have made the
   * symptom disappear and left the arithmetic in place.
   */
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.STAMP_BASE_URL || 'http://127.0.0.1:4189',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  webServer: {
    command:
      'ITERA_SOURCE_STAMP=1 ' +
      'VITE_SUPABASE_URL=http://stub.supabase.invalid VITE_SUPABASE_ANON_KEY=stub-anon-key ' +
      'npm run build && npx vite preview --port 4189 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4189',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },

  projects: [
    {
      name: 'stamp',
      testMatch: /source-stamp\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capture',
      testMatch: /capture-regions\.spec\.ts$/,
      // `launchOptions` is the ONE half of the capture environment that a
      // context cannot carry: rasterisation is decided when the browser starts,
      // and every context in it inherits that decision. The rest — viewport,
      // dpr, reduced motion, time zone — is applied per context by the spec
      // itself through `CAPTURE_CONTEXT_OPTIONS`.
      //
      // The `devices` preset below reaches only the default `page` fixture,
      // which this spec never asks for. Kept so a future test in this project
      // that DOES use `page` still gets a sane browser.
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: [...CAPTURE_LAUNCH_ARGS] },
      },
    },
    {
      // THE FROZEN EXPLORATION. Reads `e2e/support/capture-manifest.json` and
      // asserts it against the running app: reachable routes prove they are
      // themselves, gated routes prove they are still gated, and every
      // interaction state replays and captures.
      //
      // A third project rather than more tests in `capture`, because the two
      // answer different questions and a reviewer should be able to read which
      // one went red without opening a report: `capture` is "does the harness
      // work", `manifest` is "does the app still match the map we froze".
      // Both still share the one `webServer`, so the `vite build` is paid once.
      name: 'manifest',
      testMatch: /capture-manifest\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: [...CAPTURE_LAUNCH_ARGS] },
      },
    },
  ],
});
