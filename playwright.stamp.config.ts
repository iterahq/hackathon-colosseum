import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the `data-source` STAMP PROOF (P4 of plan
 * `20260812-ux-map-observed-reality-lens`).
 *
 * ## Why a third config
 *
 * There are already two, and each encodes a different substrate:
 * `playwright.config.ts` drives live prod with credentials, and
 * `playwright.baseline.config.ts` drives a hermetic `vite preview` of this tree.
 * This suite needs the hermetic substrate — but built with
 * `ITERA_SOURCE_STAMP=1`, which the baseline must NOT have.
 *
 * That is the whole reason for the split, and it is not cosmetic. The
 * characterization baseline exists to say "the behaviour of the code in this
 * tree did not move". Building it with a non-default flag would make it
 * characterize an artifact that never ships. So the flag lives here, in a
 * config whose only job is to prove the flag works, and the baseline keeps
 * measuring the default build.
 *
 * ## What it runs
 *
 * One spec: `e2e/source-stamp.spec.ts`. It walks the DOM of the declared
 * screens and resolves every stamp against the real file tree. `testMatch` is
 * pinned to that file, and the other two configs ignore it, so no suite can
 * pick up another's tests.
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
  testMatch: /source-stamp\.spec\.ts$/,

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The assertions are pure functions of the DOM and the file tree. A retry
  // could only hide a real failure.
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
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

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
