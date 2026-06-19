import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Itera↔Fellowship E2E harness (plan #7).
 *
 * MANUAL / scheduled only — this suite needs BOTH apps live (dfl-learn +
 * itera-api), the dfl-batch Results-API key, and learn login creds. It is NOT
 * part of the per-PR `ci.yml` (lint+test+build). See .github/workflows/e2e.yml.
 *
 * The spec capability-probes its substrate and `test.skip()`s (NOT fails) when
 * any prerequisite is absent, so a manual run on an incomplete substrate is
 * green-with-skips rather than red.
 */
export default defineConfig({
  testDir: './e2e',
  // Don't clash with vitest (which globs src/**/*.{test,spec}.*).
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.LEARN_BASE_URL || 'https://learn.devfellowship.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
