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
 * `testMatch` is pinned to the hermetic spec files, and the legacy config
 * carries the mirrored `testIgnore`, so neither suite can pick up the other's
 * tests.
 *
 * THREE files match, and they are NOT the same kind of suite — see the header of
 * `terminal-sandbox.spec.ts`. They run under one config because they share the
 * substrate (hermetic, credential-free, built from the tree under test) and the
 * property that matters here: **every test runs, every time, or the job is
 * red.** Adding a file to this list means adding it to `testIgnore` over in
 * `playwright.config.ts`, or the prod suite starts running it against live prod.
 *
 * `feedback-footer-width.spec.ts` joined them on 2026-08-10 and is the same kind
 * as `terminal-sandbox.spec.ts`: assertions written from a screenshot, stating
 * what the UI MUST do, measured in a real browser because jsdom has no layout.
 *
 * `program-access.spec.ts` joined them on 2026-08-13 (DFL-006A7). It is a third
 * kind again: a REGRESSION gate for a route that rendered an empty `<main>` and
 * still answered 200. It belongs here for the substrate reason — the state it
 * asserts is reached by an empty RLS-scoped read, which the stub origin can
 * produce exactly, with no credential. `route-access-matrix.spec.ts` asks the
 * neighbouring question but needs real logins, so it can only skip.
 */
const MOBILE_TOUCH = /mobile-touch\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  testMatch: /(activity-baseline|terminal-sandbox|feedback-footer-width|program-access|mobile-touch)\.spec\.ts$/,

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
  //
  // `VITE_OTEL_DISABLED=true`: a production build turns the observability
  // provider ON and exports spans to https://otel.devfellowship.com. That is a
  // request out of the hermetic substrate, and the "nenhuma requisição sai"
  // test failed whenever a span batch flushed during the run. A route-block
  // cannot fix it: Playwright's `request` event fires for routed requests too.
  // So the export is switched off at build time, here only (see `src/App.tsx`).
  webServer: {
    command:
      'VITE_OTEL_DISABLED=true ' +
      'VITE_SUPABASE_URL=http://stub.supabase.invalid VITE_SUPABASE_ANON_KEY=stub-anon-key ' +
      'npm run build && npx vite preview --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },

  // `mobile-touch.spec.ts` is about a finger, so it runs on a touch device and only
  // there. WebKit is opt-in: CI installs Chromium alone, and a second engine on
  // every PR costs a browser download plus its system libraries per run.
  // It starts after `chromium` ends, so the touch specs never share the runner with the baseline.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: MOBILE_TOUCH },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: MOBILE_TOUCH, dependencies: ['chromium'] },
    ...(process.env.BASELINE_WEBKIT
      ? [{ name: 'iphone', use: { ...devices['iPhone 13'] }, testMatch: MOBILE_TOUCH, dependencies: ['chromium'] }]
      : []),
  ],
});
