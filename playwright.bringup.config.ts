import { defineConfig, devices } from '@playwright/test';
import { CAPTURE_LAUNCH_ARGS } from './e2e/support/captureRegions';

/**
 * Playwright against the DISPOSABLE ITERA STACK — the fourth config, and the
 * first one that can photograph a screen behind `RequireAuth`.
 *
 * ## Why a fourth config, stated against the other three
 *
 * | config | substrate | can it authenticate? |
 * |---|---|---|
 * | `playwright.config.ts` | LIVE production | yes — and a read-only visit WRITES rows there |
 * | `playwright.baseline.config.ts` | `vite preview`, `stub.supabase.invalid` | no |
 * | `playwright.stamp.config.ts` | `vite preview`, `stub.supabase.invalid`, stamped | no |
 * | **this one** | `vite preview` + `bringup/` compose stack | **yes, against a throwaway database** |
 *
 * The stub configs cannot reach an authenticated screen at all, and the
 * production config reaches them by driving production. Neither can answer
 * "screenshot `/admin` without touching the ITERA production database", which
 * is what a capture run has to do on a schedule. This can.
 *
 * ## The stack is NOT started here
 *
 * `webServer` builds and previews the APP. It does not start Postgres, GoTrue
 * or PostgREST — `bringup/up.sh` does, and it must have finished first:
 *
 * ```sh
 * bringup/up.sh && npm run e2e:bringup && bringup/down.sh
 * ```
 *
 * Two reasons it is not folded into `webServer`. The stack takes about a minute
 * to build 64 migrations and Playwright's `webServer` timeout would then be
 * measuring two unrelated things at once; and the stack is deliberately
 * REUSABLE across several suites and manual sessions, while a `webServer` dies
 * with the test run.
 *
 * ⚠️ **`VITE_*` IS INLINED AT BUILD TIME.** `VITE_SUPABASE_URL` is baked into
 * the bundle by `vite build`, not read at runtime — so pointing the app at the
 * bring-up stack REQUIRES a rebuild, and a preview started from a `dist/` built
 * for another target will silently talk to that other target. That is why the
 * command below always runs `npm run build` and never reuses an existing
 * `dist/`.
 *
 * The env comes from `bringup/env.sh`, which is the single source for every
 * port and key. `npm run e2e:bringup` sources it; running `npx playwright test
 * --config playwright.bringup.config.ts` directly will fail fast below rather
 * than quietly building against a default that drifted.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. This config reads the bring-up addresses from ` +
        `bringup/env.sh, which is the single source for them. Run the suite as ` +
        `\`npm run e2e:bringup\` (it sources env.sh), and make sure ` +
        `\`bringup/up.sh\` has already completed.`
    );
  }
  return value;
}

const API_URL = required('ITERA_BRINGUP_API_URL');
const ANON_KEY = required('ITERA_BRINGUP_ANON_KEY');
const APP_URL = required('ITERA_BRINGUP_APP_URL');
const APP_PORT = new URL(APP_URL).port;

export default defineConfig({
  testDir: './e2e',
  testMatch: /bringup-capture\.spec\.ts$/,

  // Deliberately serial. The suite signs in, captures, and then captures again
  // in a fresh context to compare bytes; parallel workers would share one
  // preview server and one database, and a second worker's navigation can
  // change what the first one is photographing.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // A retry could only hide a real instability, and instability is exactly what
  // this suite measures.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Rasterisation is decided when the browser starts, so these cannot move
    // into the context options the spec applies. Same list, same reasons, as
    // `playwright.stamp.config.ts` — see `CAPTURE_LAUNCH_ARGS`.
    launchOptions: { args: CAPTURE_LAUNCH_ARGS },
    ...devices['Desktop Chrome'],
  },

  webServer: {
    command:
      `ITERA_SOURCE_STAMP=1 ` +
      `VITE_SUPABASE_URL=${API_URL} ` +
      `VITE_SUPABASE_ANON_KEY=${ANON_KEY} ` +
      `npm run build && ` +
      // `--host 127.0.0.1`: `vite preview` binds 0.0.0.0 by default, and on a
      // public VPS that publishes a preview containing the private repository
      // layout (the `data-source` stamps). Loopback only, same as the stamp
      // config.
      `npx vite preview --port ${APP_PORT} --strictPort --host 127.0.0.1`,
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
