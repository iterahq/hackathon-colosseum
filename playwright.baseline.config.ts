import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the ACTIVITY CHARACTERIZATION BASELINE — sub-plano 0 of
 * `20260731-itera-eventos-aprendizagem`.
 *
 * ## Why this is a SEPARATE config from `playwright.config.ts`
 *
 * The two suites are opposites in every dimension that a config encodes, and
 * merging them would silently drag one suite's semantics onto the other:
 *
 * |                | `playwright.config.ts` (e2e.yml)       | this one (ci.yml)             |
 * |----------------|---------------------------------------|-------------------------------|
 * | substrate      | LIVE prod (learn + api + app)         | `vite preview` of THIS tree   |
 * | credentials    | required (and not provisioned)        | none                          |
 * | absent dep     | capability-gated `test.skip()`        | impossible — nothing external |
 * | trigger        | workflow_dispatch + daily cron        | every PR, BLOCKING            |
 * | purpose        | "is prod wired together"              | "did the reducers change"      |
 *
 * A characterization baseline that can skip is not a baseline. There is no
 * `gate.ts` here on purpose: **every test must run, every time, or the job is
 * red.** That is the entire contract with sub-plano 1.
 *
 * `testMatch` is pinned to the one spec file, and the legacy config now carries
 * a matching `testIgnore`, so neither suite can pick up the other's tests.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /activity-baseline\.spec\.ts$/,

  // Hermetic: no shared server state, no login, no DB. Parallel is free, and
  // it is what keeps the suite inside the 10-minute budget (V3).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Zero. A characterization test that passes on retry is a flaky baseline, and
  // a flaky baseline cannot arbitrate a refactor.
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASELINE_BASE_URL || 'http://127.0.0.1:4188',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  // Builds with the STUB Supabase origin baked in (see `harnessStub.ts`). The
  // build is part of the suite deliberately: the thing under test is the code in
  // the working tree, not a deployment.
  webServer: {
    command:
      'VITE_SUPABASE_URL=http://stub.supabase.invalid VITE_SUPABASE_ANON_KEY=stub-anon-key ' +
      'npm run build && npx vite preview --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
