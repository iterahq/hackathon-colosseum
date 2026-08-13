/**
 * THE EXPLORATION, FROZEN — and the reason it never has to run again.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE IS
 * ═══════════════════════════════════════════════════════════════════════════
 * `e2e/support/capture-manifest.json` is the whole output of P7 as DATA: which
 * of the 31 declared routes render their own content in the hermetic
 * zero-credential substrate, which ones bounce to `/login`, and the five
 * interaction-reachable STATES that no route enumeration can find. It was
 * produced once — a deterministic pre-pass for the routes, one bounded opencode
 * + Playwright-MCP session for the states — and then verified line by line by
 * `scripts/ux-capture/verify-states.mjs`.
 *
 * This suite is what makes that freeze permanent. It makes no model call and it
 * reads no network beyond the preview. If the app changes underneath the
 * manifest, this goes red and someone updates the DATA — nobody re-explores.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS IS THE UNAUTHENTICATED SUBSTRATE. `bringup-capture.spec.ts` IS NOT.
 * ═══════════════════════════════════════════════════════════════════════════
 * There are now TWO capture suites in this repository and they answer opposite
 * questions. Do not merge them, and do not "fix" one by copying the other:
 *
 *   this suite     `substrate: hermetic-stub` — no database, no session, a
 *                  Supabase origin that does not resolve. It maps what an
 *                  UNAUTHENTICATED visitor reaches, and — the part only it can
 *                  do — what everyone else is correctly REFUSED.
 *
 *   bringup-capture  a disposable REAL ITERA stack with a signed-in
 *                    `tenant_admin`. It photographs the screens behind the
 *                    gate, which this suite can never reach by construction.
 *
 * Both call `captureScreen` from `e2e/support/captureRegions.ts`, which is the
 * shared part and the only part that should be shared.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚨 THE ASSERTION THAT MATTERS MOST IS THE NEGATIVE ONE
 * ═══════════════════════════════════════════════════════════════════════════
 * 24 of the 31 declared routes REDIRECT to `/login` with no session, and the
 * redirect is SILENT — `RequireAuth` renders no 403, it just navigates. Two
 * consequences, and the second is the one the fleet keeps re-learning:
 *
 *  1. A naive "visit each route, shoot it" capture writes the LOGIN PAGE into
 *     24 screenshots and labels each one `/admin/roster`, `/profile`,
 *     `/catalog`… That is not a broken map. It is a CONFIDENTLY WRONG map, and
 *     a designer who trusts it is worse off than one with no map at all. So
 *     every screen this suite captures must prove it is ITSELF, by a marker
 *     that only that screen carries.
 *  2. The inverse is a security assertion, and it is cheap: a route recorded as
 *     `redirects` must KEEP redirecting. The day a gate is dropped from a route
 *     by a refactor, no test in this repository would notice — except this one,
 *     which fails naming the route that stopped being gated.
 *
 * That pair is why the manifest records BOTH kinds of route instead of listing
 * only the reachable ones.
 *
 * ⚠️ **MEASURED, and weaker than this file used to claim.** Point 2 said the
 * suite catches `RequireAuth` being dropped from `/admin/roster`. A mutation
 * test on 2026-08-13 — `RequireAuth` returning its children unconditionally,
 * app rebuilt, suite run — says otherwise: only **3 of the 24** gated routes
 * stopped redirecting (`profile`, `subscribe`, `subscribe_return`). The other
 * 21 still bounce, because on this credential-free substrate a second guard or
 * a failed data load bounces them anyway. So this suite catches "the route
 * became reachable with no session", which is the property worth asserting —
 * it does NOT prove that `RequireAuth` specifically is still mounted on any
 * given route. Do not read a green here as the latter.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT DELIBERATELY DOES NOT ASSERT
 * ═══════════════════════════════════════════════════════════════════════════
 * Nothing here compares pixels against a stored baseline. Glyph rasterisation
 * belongs to the host, so a committed PNG would fail on any machine but the one
 * that made it — see the header of `e2e/support/captureRegions.ts`. Byte
 * identity is asserted only BETWEEN TWO CAPTURES IN THIS RUN, which is a
 * property of the harness and holds on every host.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  CAPTURE_CONTEXT_OPTIONS,
  REPO_ROOT,
  captureScreen,
  freezeForCapture,
  settleUntilStable,
} from './support/captureRegions';

const MANIFEST_PATH = path.join(REPO_ROOT, 'e2e', 'support', 'capture-manifest.json');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'e2e', 'artifacts', 'manifest');
const LOGIN_MARKER = '[data-testid="login-page"]';

interface Step {
  action: 'fill' | 'click' | 'press';
  selector: string;
  value?: string;
}

interface RouteEntry {
  id: string;
  route: string;
  target: string;
  reachability: 'renders' | 'redirects';
  marker: string;
  lands_on?: string;
  min_regions: number;
}

interface StateEntry {
  id: string;
  base_screen: string;
  url: string;
  label: string;
  steps: Step[];
  proof: string;
  why: string;
}

interface Manifest {
  version: number;
  substrate: string;
  routes: RouteEntry[];
  states: StateEntry[];
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const renders = manifest.routes.filter((r) => r.reachability === 'renders');
const redirects = manifest.routes.filter((r) => r.reachability === 'redirects');

/**
 * How many frames each screen needed before two matched, written out so the
 * settle rule rests on a number a reader can re-read.
 *
 * ONE FILE PER SCREEN, and that is not a style choice: this config runs
 * `fullyParallel`, so an `afterAll` that wrote a single aggregate file would
 * run once PER WORKER and each worker would overwrite the previous one's rows.
 * That is exactly what happened on the first run — 12 measurements, 2 rows on
 * disk. A file named after the screen cannot collide.
 */
const STABILITY_DIR = path.join(ARTIFACT_ROOT, 'stability-frames');

async function recordStability(
  screen: string,
  kind: 'navigation' | 'interaction',
  frames: number,
  stable: boolean
): Promise<void> {
  await mkdir(STABILITY_DIR, { recursive: true });
  writeFileSync(
    path.join(STABILITY_DIR, `${screen.replace(/[^a-z0-9_-]/gi, '_')}.json`),
    `${JSON.stringify({ screen, kind, frames, stable }, null, 2)}\n`,
    'utf8'
  );
}

async function replay(page: Page, steps: Step[]): Promise<void> {
  for (const step of steps) {
    const locator = page.locator(step.selector).first();
    await expect(locator, `step target is visible: ${step.selector}`).toBeVisible();
    if (step.action === 'fill') await locator.fill(step.value ?? '');
    else if (step.action === 'click') await locator.click();
    else await locator.press(step.value ?? 'Enter');
  }
}

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

test.describe('capture manifest', () => {
  test('the manifest is well formed and describes every declared route', () => {
    const flows = JSON.parse(
      readFileSync(path.join(REPO_ROOT, '.dfl-ux-paths', 'flows.json'), 'utf8')
    ) as { screens: { id: string }[] };

    expect(manifest.version).toBe(1);
    expect(manifest.substrate).toBe('hermetic-stub');

    // Route-for-route with the declared map. A screen added to `flows.json`
    // without a manifest entry would otherwise be captured by nothing and
    // noticed by no one.
    const declared = new Set(flows.screens.map((s) => s.id));
    const mapped = new Set(manifest.routes.map((r) => r.id));
    expect([...declared].filter((id) => !mapped.has(id)), 'declared but not in the manifest').toEqual(
      []
    );
    expect([...mapped].filter((id) => !declared.has(id)), 'in the manifest but not declared').toEqual(
      []
    );

    // A manifest where everything renders, or nothing does, is a manifest that
    // was generated against the wrong substrate.
    expect(renders.length).toBeGreaterThan(0);
    expect(redirects.length).toBeGreaterThan(0);

    for (const state of manifest.states) {
      expect(state.steps.length, `${state.id} has steps`).toBeGreaterThan(0);
      expect(state.proof.length, `${state.id} has a proof selector`).toBeGreaterThan(0);
    }
  });

  /**
   * Every reachable screen shows a marker only IT carries. One context per
   * route, failures collected rather than short-circuited — the first bad route
   * must not hide the other thirty.
   */
  test('every route recorded as reachable shows its own marker', async ({ browser }) => {
    const problems: string[] = [];
    for (const entry of renders) {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      const page = await context.newPage();
      try {
        await freezeForCapture(page);
        await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
        await page.locator(entry.marker).first().waitFor({ state: 'visible', timeout: 15000 });
        const landed = new URL(page.url()).pathname;
        if (entry.id !== 'login' && (await page.locator(LOGIN_MARKER).count()) > 0) {
          problems.push(`${entry.id} (${entry.target}) is showing the LOGIN page`);
        } else if (landed !== entry.target) {
          problems.push(`${entry.id} rendered but the URL moved to ${landed}`);
        }
      } catch (err) {
        problems.push(
          `${entry.id} (${entry.target}) never showed ${entry.marker}: ${
            String((err as Error).message).split('\n')[0]
          }`
        );
      }
      await context.close();
    }
    expect(problems, `${problems.length} reachable route(s) did not prove they were themselves`).toEqual(
      []
    );
  });

  /**
   * The inverse, and the security half. Every gated route must STILL bounce.
   *
   * ⚠️ Read a failure here carefully: it does not mean the capture broke. It
   * means a route that required a session stopped requiring one.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * ONE TEST PER ROUTE, AND THAT IS A TIMING FIX (2026-08-13)
   * ═══════════════════════════════════════════════════════════════════════════
   * This was ONE test with the 24 routes in a `for` loop, and it went red 8
   * times in the 39 executions that followed the merge that introduced it —
   * always `Test timeout of 45000ms exceeded`, always green when re-run at the
   * same SHA. Nothing was leaking and no gate had moved. The arithmetic did it:
   *
   *   - `playwright.stamp.config.ts` sets ONE `timeout: 45_000`. It was sized
   *     on 2026-08-12 for `source-stamp.spec.ts`, where a test opens ONE
   *     context and reads ONE screen (measured 1.5s - 7.1s).
   *   - This walk opens **24 contexts in sequence**, so its cost is O(routes)
   *     while its budget is a constant. Measured on the runner across 22 green
   *     executions: median 23.8s, p90 34.9s, worst green 42.5s — against 45s.
   *   - A test whose median sits at HALF its timeout does not fail rarely. It
   *     fails whenever the shared 4-vCPU runner is busy, which is often.
   *
   * A bigger constant would have moved that cliff, not removed it: the 25th
   * gated route puts it back. Splitting removes the scaling instead. Each test
   * below does ONE navigation against the same untouched 45s budget, and the 24
   * of them spread across the 4 workers. Measured A/B on one machine, same
   * load, `--workers=4`:
   *
   *   | | slowest single test | suite wall |
   *   |---|---|---|
   *   | one 24-route loop | 24.7s / 24.3s | 36.2s / 36.9s |
   *   | 24 tests          | 10.4s / 10.0s (a DIFFERENT test) | 35.9s / 34.6s |
   *
   * The 24 gated units themselves land at 1.2s min / 1.5s median / 1.8s max —
   * roughly 25x headroom instead of 1.9x — and the suite pays no wall-clock for
   * it. The slowest test is now the 7-route `renders` walk, which has always
   * been there and is 4x under the budget.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * 🚨 AND THE LOOP HID THE REAL FAILURE BEHIND THE SAME MESSAGE
   * ═══════════════════════════════════════════════════════════════════════════
   * This is the part that makes the split a SECURITY fix and not only a timing
   * one. Mutation test, run before and after: `RequireAuth` was made to return
   * its children unconditionally — a gate removed — and the suite was run
   * against that build.
   *
   *   - **Loop version:** one failure, reading `Test timeout of 45000ms
   *     exceeded` plus a teardown protocol error. It named NO route. Three
   *     routes stopped redirecting, so three iterations each burned the full
   *     15s marker wait; 3 x 15s alone exhausts the 45s budget, and the loop
   *     was killed before it could reach its own `expect`.
   *   - **Split version:** three failures, `gated route profile …`,
   *     `gated route subscribe …`, `gated route subscribe_return …`.
   *
   * So the flake and a genuinely removed gate produced BYTE-IDENTICAL failure
   * text. Anyone taught by the flake to re-run would have re-run the real one
   * too. That is the failure mode the split closes: a red here now says which
   * route, and a timeout can no longer be the thing that reports it.
   *
   * Two properties the loop had, kept on purpose:
   *
   *  1. **One bad route must not hide the others.** The loop collected
   *     `problems` instead of throwing. Independent tests give the same result
   *     structurally — all 24 run — and the route name moves into the TEST
   *     TITLE, so a reviewer reads which gate opened without opening a report.
   *  2. **A fresh context per route.** Not cosmetic: it is what makes the claim
   *     "with no session" true for every route rather than only the first.
   *
   * ⚠️ **Zero routes would mean zero tests, and zero tests is green.** That
   * trap is real for any test generated from data, and it is closed above, not
   * here: the well-formedness test asserts `redirects.length > 0` AND that the
   * manifest is route-for-route with `flows.json`. A gated route cannot leave
   * this list quietly — it either breaks that comparison, or it is reclassified
   * as `renders` and then has to prove it shows its own marker.
   */
  for (const entry of redirects) {
    test(`gated route ${entry.id} still redirects to the login page`, async ({ browser }) => {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      const page = await context.newPage();
      const ungated: string[] = [];
      try {
        await freezeForCapture(page);
        await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
        await page.locator(LOGIN_MARKER).first().waitFor({ state: 'visible', timeout: 15000 });
        const landed = new URL(page.url()).pathname;
        if (landed !== (entry.lands_on ?? '/login')) {
          ungated.push(`${entry.id} landed on ${landed}, manifest says ${entry.lands_on}`);
        }
      } catch {
        ungated.push(
          `${entry.id} (${entry.target}) did NOT redirect to the login page — a gate may have been removed`
        );
      }
      await context.close();
      expect(ungated, `${entry.id} changed behaviour`).toEqual([]);
    });
  }

  /**
   * The states. Each one is replayed from a clean context, proved, and
   * captured — so an interaction-reachable state becomes a capturable screen
   * with the same `screenshot.png` + `regions.json` pair as a route.
   *
   * `stabilise: true` because these are reached by a CLICK whose visible effect
   * arrives with a rejected request. See `settleUntilStable`.
   */
  for (const state of manifest.states) {
    test(`state ${state.id} replays, proves itself and captures`, async ({ browser }) => {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      const page = await context.newPage();
      await freezeForCapture(page);
      await page.goto(state.url, { waitUntil: 'domcontentloaded' });
      await replay(page, state.steps);

      await expect(
        page.locator(state.proof).first(),
        `${state.id}: the proof selector never appeared`
      ).toBeVisible({ timeout: 15000 });

      // Anti-impersonation, same rule as the routes.
      if (state.url !== '/login') {
        expect(await page.locator(LOGIN_MARKER).count(), `${state.id} bounced to login`).toBe(0);
      }

      const result = await captureScreen(page, {
        outDir: path.join(ARTIFACT_ROOT, state.id),
        screen: state.id,
        stabilise: true,
      });

      expect(result.stability?.stable, `${state.id} never stopped moving`).toBe(true);
      expect(result.manifest.regions.length, `${state.id} produced an empty map`).toBeGreaterThan(3);

      await recordStability(state.id, 'interaction', result.stability!.frames, result.stability!.stable);
      console.log(
        `  ${state.id.padEnd(28)} ${String(result.manifest.regions.length).padStart(4)} regions  ` +
          `settled after ${result.stability!.frames} frames`
      );
      await context.close();
    });
  }

  /**
   * One state, captured twice from two fresh contexts, must be byte-identical.
   *
   * ONE and not all five, deliberately. `capture-regions.spec.ts` already
   * proves byte-identity for three navigation-reached screens on every PR; what
   * is unproven is whether an INTERACTION-reached screen — where the pixels
   * depend on a request that failed — is equally repeatable. One witness
   * answers that. The cron (`.github/workflows/ux-capture.yml`) runs it across
   * every screen and every state, where the wall clock is nobody's PR.
   *
   * `otp_invalid_code_error` is the witness because it is the deepest: four
   * steps, two rejected requests, and an error rendered from a caught failure.
   */
  test('an interaction-reached state captured twice is byte-identical', async ({ browser }) => {
    const state = manifest.states.find((s) => s.id === 'otp_invalid_code_error');
    expect(state, 'the byte-identity witness is still in the manifest').toBeDefined();

    const shoot = async (label: string): Promise<Buffer> => {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      const page = await context.newPage();
      await freezeForCapture(page);
      await page.goto(state!.url, { waitUntil: 'domcontentloaded' });
      await replay(page, state!.steps);
      await expect(page.locator(state!.proof).first()).toBeVisible({ timeout: 15000 });
      const result = await captureScreen(page, {
        outDir: path.join(ARTIFACT_ROOT, 'stability', state!.id, label),
        screen: state!.id,
        stabilise: true,
      });
      await recordStability(
        `${state!.id}-${label}`,
        'interaction',
        result.stability!.frames,
        result.stability!.stable
      );
      await context.close();
      return result.png;
    };

    const a = await shoot('a');
    const b = await shoot('b');
    console.log(`  ${state!.id} A ${sha256(a)}\n  ${' '.repeat(state!.id.length)} B ${sha256(b)}`);
    expect(sha256(b), 'two captures of one interaction state must be byte-identical').toBe(
      sha256(a)
    );
  });

});

/**
 * The settle rule, measured on the NAVIGATION case too, so the claim that
 * navigation needs no polling is a measurement rather than an assumption.
 */
test.describe('settle rule', () => {
  test('a navigation-reached screen is already still when the fixed wait ends', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const worst: { id: string; frames: number }[] = [];
    for (const entry of renders) {
      const context = await browser.newContext(CAPTURE_CONTEXT_OPTIONS);
      const page = await context.newPage();
      await freezeForCapture(page);
      await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
      await page.locator(entry.marker).first().waitFor({ state: 'visible', timeout: 15000 });
      const result = await settleUntilStable(page);
      worst.push({ id: entry.id, frames: result.frames });
      await recordStability(entry.id, 'navigation', result.frames, result.stable);
      expect(result.stable, `${entry.id} never stopped moving`).toBe(true);
      await context.close();
    }
    const max = Math.max(...worst.map((w) => w.frames));
    console.log(
      `  navigation-reached screens settled in ${max} frame(s) at worst: ` +
        worst.map((w) => `${w.id}=${w.frames}`).join(' ')
    );
    // 2 is the floor: `settleUntilStable` always takes a second shot to
    // compare. A navigation screen needing a THIRD would mean the fixed 300ms
    // in `settleForCapture` is no longer sufficient, and this is where we would
    // find that out.
    expect(max, 'a navigation-reached screen needed more than one comparison').toBe(2);
  });
});
