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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 📱 ONE SUITE, TWO VIEWPORTS — `manifest` and `manifest-mobile`
 * ═══════════════════════════════════════════════════════════════════════════
 * This file runs TWICE, once per project, and the only difference between the
 * two runs is the `captureViewport` option that
 * `playwright.stamp.config.ts` sets. Everything else — the routes, the gates,
 * the states, the markers — is the SAME frozen data replayed in a second
 * browser context (390x844, `isMobile`, `hasTouch`; ADR-6 of plan
 * `20260902-ux-paths-responsive-mobile-capture`).
 *
 * That is the whole thesis of the mobile round, and it is worth stating because
 * it is what makes the second pass free of a model: the exploration ALREADY
 * happened. Every `routes[]` entry has a concrete `target` and a selector
 * `marker`; every `states[]` entry has a `url`, selector `steps[]` and a
 * selector `proof`. Not one of them is coordinate-based, so not one of them
 * depends on the width.
 *
 * ✅ And that held when measured. `node scripts/ux-capture/prepass.mjs
 * --viewport mobile` on 2026-09-02 flagged **zero of the 31 routes**: same
 * reachability, same landing path, same visible stamped-region count, same
 * `data-testid` set, same `h1`. So `marker_by_viewport` and
 * `min_regions_by_viewport` are present in the manifest and EMPTY, and the
 * per-viewport lookups below all fall through to the base value.
 *
 * ⚠️ Do not read that emptiness as "the per-viewport override was not needed
 * after all". It is what makes the FIRST route that does need one a data change
 * instead of a code change — and a marker is an anti-impersonation proof, so it
 * is a value a human commits, never a number the prepass writes.
 *
 * 🚨 The assertion that is NOT vacuous at a new viewport is the marker
 * UNIQUENESS one, and it is new in this pass: a marker must match its own route
 * AND NO OTHER reachable route, at every viewport. Without it, "every screen
 * proves it is itself" is satisfied by a marker that every screen carries.
 */
import { expect, test as base, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_VIEWPORT_PRESET,
  REPO_ROOT,
  VIEWPORT_PRESETS,
  captureContextOptions,
  captureDirName,
  captureScreen,
  freezeForCapture,
  settleUntilStable,
  viewportLabel,
  type CaptureViewportOptions,
  type ViewportPresetName,
} from './support/captureRegions';

/**
 * The viewport arrives as a test OPTION, so both projects run in ONE
 * `playwright test` invocation and share the single `webServer`. See
 * `CaptureViewportOptions` in `e2e/support/captureRegions.ts` for why this is
 * not an env var.
 */
const test = base.extend<CaptureViewportOptions>({
  captureViewport: [DEFAULT_VIEWPORT_PRESET, { option: true }],
});

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
  /**
   * Present only on a state that exists at ONE viewport — a bottom sheet, an
   * overflow menu, a drawer that has no `lg` counterpart. Absent means "replays
   * at every viewport", which is true of all five states frozen today.
   * Populated by T5, not by this task.
   */
  viewport?: ViewportPresetName;
}

/**
 * One viewport this manifest is replayed at.
 *
 * `capture_routes` is the list of DECLARED screen ids this pass photographs at
 * this viewport, and it is DATA rather than an `if (viewport === 'mobile')` in
 * the suite. The manifest states the reason next to each list: desktop
 * photographs none here because `capture-regions.spec.ts` already owns
 * `login` and `not_found` under `regions/`, and mobile photographs exactly
 * those same two so the two viewports publish the same 2 of 31.
 */
interface ViewportEntry {
  name: ViewportPresetName;
  width: number;
  height: number;
  capture_routes: string[];
}

interface Manifest {
  version: number;
  substrate: string;
  /** Optional: a manifest written before the mobile pass has no `viewports`. */
  viewports?: ViewportEntry[];
  /**
   * Per-viewport overrides, empty today and measured to be empty — see
   * `provenance.viewports` in the manifest. A marker override is committed by a
   * human; the prepass only proposes one.
   */
  marker_by_viewport?: Record<string, Record<string, string>>;
  min_regions_by_viewport?: Record<string, Record<string, number>>;
  routes: RouteEntry[];
  states: StateEntry[];
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const renders = manifest.routes.filter((r) => r.reachability === 'renders');
const redirects = manifest.routes.filter((r) => r.reachability === 'redirects');

/**
 * The per-viewport lookups. Each falls back to the base value, which is what
 * makes an EMPTY override table behave exactly like no override table at all —
 * so the desktop pass is bit-for-bit the run it always was.
 */
const markerFor = (entry: RouteEntry, viewport: string): string =>
  manifest.marker_by_viewport?.[viewport]?.[entry.id] ?? entry.marker;

const minRegionsFor = (entry: RouteEntry, viewport: string): number =>
  manifest.min_regions_by_viewport?.[viewport]?.[entry.id] ?? entry.min_regions;

/** The `viewports[]` row for a viewport, or a photograph-nothing default. */
const viewportEntry = (viewport: ViewportPresetName): ViewportEntry => {
  const found = manifest.viewports?.find((v) => v.name === viewport);
  if (found) return found;
  const preset = VIEWPORT_PRESETS[viewport];
  return { name: viewport, width: preset.width, height: preset.height, capture_routes: [] };
};

/**
 * A state that declares a `viewport` is replayed only there. Absent = every
 * viewport, which is every state frozen today.
 */
const statesFor = (viewport: ViewportPresetName): StateEntry[] =>
  manifest.states.filter((s) => !s.viewport || s.viewport === viewport);

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
  stable: boolean,
  viewport: ViewportPresetName
): Promise<void> {
  await mkdir(STABILITY_DIR, { recursive: true });
  // The VIEWPORT is in the file name for the same reason the screen is: the two
  // projects run in one invocation, so `login.json` written by both would leave
  // one measurement on disk and no way to tell which pass produced it.
  const name = captureDirName(screen, viewport).replace(/[^a-z0-9_@-]/gi, '_');
  writeFileSync(
    path.join(STABILITY_DIR, `${name}.json`),
    `${JSON.stringify({ screen, viewport, kind, frames, stable }, null, 2)}\n`,
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

    // ── The viewport table ────────────────────────────────────────────────
    // Every viewport this manifest claims must be a preset the PACKAGE knows,
    // and its size must be the package's size. A row that drifted would send
    // the suite to 390x844 while naming a directory `@360x800`, and both halves
    // would look fine on their own.
    expect(manifest.viewports, 'the manifest declares its viewports').toBeDefined();
    const names = manifest.viewports!.map((v) => v.name);
    expect(names, 'the default viewport is declared').toContain(DEFAULT_VIEWPORT_PRESET);
    for (const row of manifest.viewports!) {
      const preset = VIEWPORT_PRESETS[row.name];
      expect(preset, `${row.name} is a preset the capture package knows`).toBeDefined();
      expect(
        `${row.width}x${row.height}`,
        `${row.name} size agrees with the package preset`
      ).toBe(viewportLabel(preset));
      // A photographed route must be a route. A typo here publishes nothing
      // and says nothing, which is the failure `published-screens.json` exists
      // to make loud.
      for (const id of row.capture_routes) {
        expect(
          renders.map((r) => r.id),
          `${row.name} photographs ${id}, which must be a route recorded as reachable`
        ).toContain(id);
      }
    }

    // An override table may only name routes and viewports that exist. An
    // override for a deleted route is dead data that reads as coverage.
    for (const [viewport, byId] of Object.entries(manifest.marker_by_viewport ?? {})) {
      expect(names, `marker_by_viewport names viewport ${viewport}`).toContain(viewport);
      for (const id of Object.keys(byId)) {
        expect(
          manifest.routes.map((r) => r.id),
          `marker_by_viewport.${viewport} names route ${id}`
        ).toContain(id);
      }
    }
    for (const [viewport, byId] of Object.entries(manifest.min_regions_by_viewport ?? {})) {
      expect(names, `min_regions_by_viewport names viewport ${viewport}`).toContain(viewport);
      for (const id of Object.keys(byId)) {
        expect(
          manifest.routes.map((r) => r.id),
          `min_regions_by_viewport.${viewport} names route ${id}`
        ).toContain(id);
      }
    }

    // A state pinned to one viewport must name a declared one, or it replays
    // nowhere and nothing says so.
    for (const state of manifest.states) {
      if (state.viewport) {
        expect(names, `state ${state.id} is pinned to a declared viewport`).toContain(
          state.viewport
        );
      }
    }
  });

  /**
   * 🚨 THE MARKER IS AN ANTI-IMPERSONATION PROOF, AND THIS IS WHAT MAKES IT ONE.
   *
   * "Every reachable screen shows its own marker" is satisfied by a marker that
   * EVERY screen carries. The suite already guards the worst case of that — a
   * screen that is secretly the login page — with an explicit `LOGIN_MARKER`
   * count. This generalises it: on each reachable route, the marker of every
   * OTHER reachable route must be ABSENT.
   *
   * It is a pure-data assertion at heart, run against the real DOM because that
   * is the only place the answer lives: two CSS selectors can be textually
   * different and still match the same element.
   *
   * ⚠️ It runs at EVERY viewport, and that is the reason it is in this pass. A
   * marker chosen at 1280 has never been shown to be discriminating at 390 —
   * a `lg:`-only element that disappears on a phone leaves its route with a
   * marker that matches nothing, and an element that only appears below `lg`
   * (a hamburger, a bottom bar) can appear on several routes at once.
   */
  // ONE TEST PER ROUTE, for the reason the whole file keeps re-learning: this
  // was drafted as a single walk over the 7 reachable routes and MEASURED at
  // p90 18.9s / max 19.6s against the 45s timeout — the slowest test in the
  // config and the only remaining O(routes) one. Split, each unit is ~2.7s.
  // The 2026-08-13 note under the gated routes is explicit that a bigger
  // constant moves the cliff and splitting removes the scaling.
  for (const entry of renders) {
    test(`reachable route ${entry.id} matches no other reachable marker`, async ({
      browser,
      captureViewport,
    }) => {
      const mine = markerFor(entry, captureViewport);
      const others = renders.filter((r) => r.id !== entry.id);
      // Zero others would make this test vacuously green. It cannot happen
      // while the well-formedness test asserts `renders.length > 0` and the
      // manifest is route-for-route with `flows.json`, but the assertion costs
      // nothing and the alternative is a test that passes by having nothing to
      // compare.
      expect(others.length, 'there is another reachable route to compare against').toBeGreaterThan(
        0
      );

      const context = await browser.newContext(captureContextOptions(captureViewport));
      const page = await context.newPage();
      const problems: string[] = [];
      try {
        await freezeForCapture(page);
        await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
        await page.locator(mine).first().waitFor({ state: 'visible', timeout: 15000 });

        for (const other of others) {
          const theirs = markerFor(other, captureViewport);
          // Two selectors that are textually different may still match one
          // element, so the real check is against the DOM. The string check
          // only catches the blunter case first, with a clearer message.
          if (theirs === mine) {
            problems.push(
              `${entry.id} and ${other.id} share the marker ${mine} — a shared marker ` +
                `cannot prove either screen is itself`
            );
            continue;
          }
          const count = await page.locator(theirs).count();
          if (count > 0) {
            problems.push(
              `${entry.id} also matches ${other.id}'s marker ${theirs} (${count}x) — ` +
                `so ${other.id}'s marker cannot prove ${other.id} is itself`
            );
          }
        }
      } catch (err) {
        problems.push(
          `${entry.id} never showed its own marker ${mine}: ${
            String((err as Error).message).split('\n')[0]
          }`
        );
      }
      await context.close();

      expect(
        problems,
        `${entry.id}'s marker is not discriminating at ${captureViewport}`
      ).toEqual([]);
    });
  }

  /**
   * Every reachable screen shows a marker only IT carries, is ALREADY STILL
   * when the fixed wait ends, and — for the ones this viewport publishes — is
   * photographed.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * ONE TEST PER ROUTE, for the reason the gated half already is
   * ═══════════════════════════════════════════════════════════════════════════
   * This was ONE test walking all 7 reachable routes, and the block below the
   * gated routes records at length why that shape is a timing bomb: the cost is
   * O(routes) against a constant `timeout`. The 7-route walk was 4x under
   * budget, so it survived the 2026-08-13 split. It does not survive this pass:
   * the suite now runs at TWO viewports, and a walk that also captures is
   * strictly more work per route than the one that only proved a marker.
   *
   * So it is split, and the route name moves into the test title — a reviewer
   * reads which route went red without opening a report, and a timeout can no
   * longer be the thing that reports it.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * THREE ASSERTIONS, ONE NAVIGATION, and that is the reason they share a test
   * ═══════════════════════════════════════════════════════════════════════════
   * The settle measurement and the capture both need EXACTLY the state the
   * marker proof establishes: navigated, marker visible, nothing moving. Two
   * further tests would each pay a third navigation to rebuild an identical
   * page. What is NOT folded in is the marker-UNIQUENESS check above, because a
   * shared marker is a different kind of finding — a data problem in the
   * manifest, not a change in the app.
   *
   * The settle number is a MEASUREMENT this keeps honest rather than an
   * assumption: 2 frames is the floor (`settleUntilStable` always takes a
   * second shot to compare), and a navigation screen needing a THIRD would mean
   * the fixed 300ms in `settleForCapture` is no longer sufficient. This is
   * where that would be found out, per viewport.
   */
  for (const entry of renders) {
    test(`reachable route ${entry.id} is itself, is still, and captures`, async ({
      browser,
      captureViewport,
    }) => {
      const marker = markerFor(entry, captureViewport);
      const photographs = viewportEntry(captureViewport).capture_routes.includes(entry.id);

      const context = await browser.newContext(captureContextOptions(captureViewport));
      const page = await context.newPage();
      const problems: string[] = [];
      try {
        await freezeForCapture(page);
        await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
        await page.locator(marker).first().waitFor({ state: 'visible', timeout: 15000 });
        const landed = new URL(page.url()).pathname;
        if (entry.id !== 'login' && (await page.locator(LOGIN_MARKER).count()) > 0) {
          problems.push(`${entry.id} (${entry.target}) is showing the LOGIN page`);
        } else if (landed !== entry.target) {
          problems.push(`${entry.id} rendered but the URL moved to ${landed}`);
        }
      } catch (err) {
        problems.push(
          `${entry.id} (${entry.target}) never showed ${marker}: ${
            String((err as Error).message).split('\n')[0]
          }`
        );
      }
      expect(problems, `${entry.id} did not prove it was itself`).toEqual([]);

      if (!photographs) {
        const settle = await settleUntilStable(page);
        await recordStability(entry.id, 'navigation', settle.frames, settle.stable, captureViewport);
        expect(settle.stable, `${entry.id} never stopped moving`).toBe(true);
        expect(
          settle.frames,
          `${entry.id} needed more than one comparison to stop moving`
        ).toBe(2);
        await context.close();
        return;
      }

      // ── The published pair ──────────────────────────────────────────────
      // `stabilise: true` so the capture uses the MEASURED stop condition and
      // reports the frame count, exactly as the interaction states do. It is
      // the same two-frame comparison the branch above asserts, done inside
      // `captureScreen` so the image that is written is the one that matched.
      const result = await captureScreen(page, {
        outDir: path.join(ARTIFACT_ROOT, captureDirName(entry.id, captureViewport)),
        screen: entry.id,
        stabilise: true,
      });

      expect(result.stability?.stable, `${entry.id} never stopped moving`).toBe(true);
      expect(result.stability?.frames, `${entry.id} needed a third frame`).toBe(2);

      // The image is in the viewport's own pixel space, and `regions.json`
      // records it. A pair whose viewport does not match the pass that took it
      // would put a phone-shaped region map next to a desktop image.
      const preset = VIEWPORT_PRESETS[captureViewport];
      expect(result.manifest.viewport, `${entry.id} recorded its viewport`).toEqual({
        width: preset.width,
        height: preset.height,
      });
      expect(result.manifest.devicePixelRatio, 'dpr must be 1 so CSS px == image px').toBe(1);

      const floor = minRegionsFor(entry, captureViewport);
      expect(
        result.manifest.regions.length,
        `${entry.id} at ${captureViewport}: fewer than ${floor} regions — did the screen ` +
          `render, and was the build stamped?`
      ).toBeGreaterThanOrEqual(floor);

      await recordStability(
        entry.id,
        'navigation',
        result.stability!.frames,
        result.stability!.stable,
        captureViewport
      );
      console.log(
        `  ${entry.id.padEnd(28)} ${captureViewport.padEnd(8)} ` +
          `${String(result.manifest.regions.length).padStart(4)} regions  ` +
          `${result.manifest.viewport.width}x${result.manifest.viewport.height}  ` +
          `settled after ${result.stability!.frames} frames`
      );
      await context.close();
    });
  }

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
    /*
     * The gate's destination is per-route, not always /login: /subscribe sends
     * a signed-out visitor to /signup, because every landing CTA points there
     * and the person arriving has no account to sign in with. So the marker
     * comes from the MANIFEST row — a hardcoded LOGIN_MARKER would have made
     * "still gated" and "still lands on the login page" the same assertion, and
     * only one of those is the property this test is for.
     */
    const landsOn = entry.lands_on ?? '/login';
    test(`gated route ${entry.id} still redirects to ${landsOn}`, async ({
      browser,
      captureViewport,
    }) => {
      const marker = markerFor(entry, captureViewport);
      const context = await browser.newContext(captureContextOptions(captureViewport));
      const page = await context.newPage();
      const ungated: string[] = [];
      try {
        await freezeForCapture(page);
        await page.goto(entry.target, { waitUntil: 'domcontentloaded' });
        await page.locator(marker).first().waitFor({ state: 'visible', timeout: 15000 });
        const landed = new URL(page.url()).pathname;
        if (landed !== landsOn) {
          ungated.push(`${entry.id} landed on ${landed}, manifest says ${landsOn}`);
        }
      } catch {
        ungated.push(
          `${entry.id} (${entry.target}) did NOT redirect to ${landsOn} — a gate may have been removed`
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
    test(`state ${state.id} replays, proves itself and captures`, async ({
      browser,
      captureViewport,
    }) => {
      // A state pinned to another viewport does not exist here. It is SKIPPED
      // rather than filtered out of the loop, so the run says out loud that the
      // state was considered — a silently absent test is a silently absent
      // assertion, and `statesFor` is the same predicate stated once.
      test.skip(
        !statesFor(captureViewport).some((s) => s.id === state.id),
        `${state.id} is pinned to viewport ${state.viewport}`
      );

      const context = await browser.newContext(captureContextOptions(captureViewport));
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
        outDir: path.join(ARTIFACT_ROOT, captureDirName(state.id, captureViewport)),
        screen: state.id,
        stabilise: true,
      });

      expect(result.stability?.stable, `${state.id} never stopped moving`).toBe(true);
      expect(result.manifest.regions.length, `${state.id} produced an empty map`).toBeGreaterThan(3);

      await recordStability(
        state.id,
        'interaction',
        result.stability!.frames,
        result.stability!.stable,
        captureViewport
      );
      console.log(
        `  ${state.id.padEnd(28)} ${captureViewport.padEnd(8)} ` +
          `${String(result.manifest.regions.length).padStart(4)} regions  ` +
          `${result.manifest.viewport.width}x${result.manifest.viewport.height}  ` +
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
  test('an interaction-reached state captured twice is byte-identical', async ({
    browser,
    captureViewport,
  }) => {
    const state = manifest.states.find((s) => s.id === 'otp_invalid_code_error');
    expect(state, 'the byte-identity witness is still in the manifest').toBeDefined();

    const shoot = async (label: string): Promise<Buffer> => {
      const context = await browser.newContext(captureContextOptions(captureViewport));
      const page = await context.newPage();
      await freezeForCapture(page);
      await page.goto(state!.url, { waitUntil: 'domcontentloaded' });
      await replay(page, state!.steps);
      await expect(page.locator(state!.proof).first()).toBeVisible({ timeout: 15000 });
      const result = await captureScreen(page, {
        outDir: path.join(
          ARTIFACT_ROOT,
          'stability',
          captureDirName(state!.id, captureViewport),
          label
        ),
        screen: state!.id,
        stabilise: true,
      });
      await recordStability(
        `${state!.id}-${label}`,
        'interaction',
        result.stability!.frames,
        result.stability!.stable,
        captureViewport
      );
      await context.close();
      return result.png;
    };

    const a = await shoot('a');
    const b = await shoot('b');
    console.log(
      `  ${state!.id} @${captureViewport} A ${sha256(a)}\n` +
        `  ${' '.repeat(state!.id.length)}             B ${sha256(b)}`
    );

    // 🚨 THIS IS THE ASSERTION ADR-7 IS ABOUT, AND IT IS NOT WEAKENED HERE.
    //
    // The 7 launch flags were tuned at 1280. ADR-7 says that IF two fresh 390
    // runs differ, the mobile DIGEST RECORD becomes recording-only — and
    // `scripts/ux-capture/digests.mjs` implements exactly that, for the pixel
    // half. It does NOT say this assertion should be softened: a capture that
    // is not repeatable inside one run cannot be diffed at all, at any
    // viewport, so there is nothing downstream that a green here would be
    // lying to. A red here is the signal ADR-7 asks a human to look at.
    expect(
      sha256(b),
      `two captures of one interaction state at ${captureViewport} must be byte-identical`
    ).toBe(sha256(a));
  });

});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE THE SETTLE RULE WENT — it did not go away, it moved UP
 * ═══════════════════════════════════════════════════════════════════════════
 * A `settle rule` describe block used to live here. It walked all 7 reachable
 * routes in ONE test, measured `settleUntilStable` on each, and asserted that
 * the WORST needed exactly 2 frames — the claim that a navigation-reached
 * screen is already still when `settleForCapture`'s fixed 300ms ends.
 *
 * That assertion is unchanged and it is still made on every reachable route, at
 * every viewport. It is now inside `reachable route <id> is itself, is still,
 * and captures`, asserted PER ROUTE as `frames === 2` — which is arithmetically
 * the same statement as `max === 2` over the same set, and strictly better to
 * read: the failure names the route instead of a maximum.
 *
 * Two things were wrong with keeping it separate once the suite ran twice:
 *
 *  1. It was the last O(routes) test in this file, against a constant
 *     `timeout`. The block above the gated routes records what that shape cost
 *     the first time — 8 red in 39 runs, a flake indistinguishable from a
 *     removed gate.
 *  2. It re-navigated to a page the marker test had just built, so the second
 *     viewport would have doubled 7 navigations to prove a fact the first
 *     test's own page already held.
 *
 * The per-screen frame counts are still written to
 * `e2e/artifacts/manifest/stability-frames/`, now with the viewport in the file
 * name, so the numbers are still readable after the run.
 */
