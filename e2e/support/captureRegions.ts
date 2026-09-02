/**
 * THE CLICKABLE LAYER OF A SCREENSHOT — `screenshot.png` + `regions.json`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚚 THE PRODUCER MOVED OUT OF THIS REPOSITORY
 * ═══════════════════════════════════════════════════════════════════════════
 * Everything general about a UX-map capture — the `data-source` build stamp,
 * the component namer, the deterministic browser, the DOM walk, the region
 * geometry, and the hit test — now lives in
 * **`@devfellowship/ux-paths-capture`**, on the public npm registry.
 *
 * It did not move for tidiness. A second application had to capture itself the
 * same way, it lives in another GitHub organization, and no token on either
 * side can read across that boundary. Copying the stamp would have made the
 * THIRD implementation of one contract: `@devfellowship/ux-paths-spec` already
 * carried a restated `resolveRegionAt` for the reader, and its own header
 * recorded that as debt. Two producers drift the way two readers already did,
 * and the drift is invisible — both stay green while a designer clicks one
 * element and is handed another element's file. npm crosses the boundary that a
 * repository cannot.
 *
 * So this file is now **composition, not implementation**. It holds the three
 * things that are true of THIS app and of no other:
 *
 *  1. where its repository root is,
 *  2. which font faces its first paint needs before a box may be measured,
 *  3. the frozen instant its screens print.
 *
 * A fix to the stamp, the walk, or the hit test lands in the package and
 * arrives here by version bump. There is nothing left to keep in step by hand.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS STILL TRUE, AND IS WORTH RE-READING
 * ═══════════════════════════════════════════════════════════════════════════
 * The two files are a PAIR. `regions.json` describes the geometry of exactly
 * one image, in that image's own pixel space. Neither is useful alone.
 *
 * 🧊 Byte-identity is a ONE-HOST promise. Fonts here are self-hosted
 * (`public/vendor/fonts/`, see `index.html`) so there is no CDN in the loop, but
 * GLYPH RASTERISATION still belongs to the machine: a different FreeType or
 * fontconfig renders the same text with different anti-aliasing. Two captures
 * on ONE machine are byte-identical — that is what `e2e/capture-regions.spec.ts`
 * proves — and a cross-machine diff must run in one container to mean anything.
 *
 * The full reasoning for every frozen source, for the launch flags, and for why
 * the shot is viewport-clipped rather than `fullPage`, lives in the package.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import {
  applyFreezeStylesheet,
  collectRegions as collectRegionsFromPage,
  installDeterminism,
  writeCapturePair,
} from "@devfellowship/ux-paths-capture/playwright";
import { SOURCE_STAMP_ATTR, type RegionsFile } from "@devfellowship/ux-paths-capture";

export type { RegionsFile };

/** `package.json` declares `"type": "module"` — no `__dirname` here. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A fixed instant, in the past relative to any session the harness mints, so a
 * stubbed token always reads as valid. Any UI that prints a date prints this
 * one, every run.
 *
 * It is THIS repository's instant and not the package default: changing it
 * would change what every dated screen renders, and every capture digest with
 * it, for no gain.
 */
export const FROZEN_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

/** The attribute the build stamp writes. One name, one place — the package. */
export const SOURCE_ATTR = SOURCE_STAMP_ATTR;

// The contract, the deterministic browser and the hit test, forwarded so that
// every existing import of this module keeps working unchanged.
export {
  CAPTURE_CONTEXT_OPTIONS,
  CAPTURE_LAUNCH_ARGS,
  CAPTURE_VIEWPORT,
} from "@devfellowship/ux-paths-capture/playwright";
export { parseStamp, resolveRegionAt, type Region } from "@devfellowship/ux-paths-capture";

/**
 * 📱 THE SECOND VIEWPORT, forwarded from the same one place.
 *
 * `captureContextOptions(preset)` is the FACTORY that replaced the frozen
 * `CAPTURE_CONTEXT_OPTIONS` literal, and the package asserts that
 * `captureContextOptions("desktop")` is deep-equal to it — so nothing about the
 * existing captures moves. `captureDirName` decides `<id>` vs `<id>@<WxH>`
 * (ADR-3) and `screenshotMetaFor` decides `platform` / `orientation` from the
 * preset rather than from the width (ADR-6).
 *
 * They are re-exported here for the same reason the three above are: this file
 * is the ONE import surface the suites use for the capture contract, so a
 * package bump reaches every consumer without 6 import lines being edited.
 */
export {
  DEFAULT_VIEWPORT_PRESET,
  VIEWPORT_PRESETS,
  captureContextOptions,
  captureDirName,
  screenshotMetaFor,
  viewportLabel,
  type ViewportPreset,
  type ViewportPresetName,
} from "@devfellowship/ux-paths-capture/playwright";

import type { ViewportPresetName as PresetName } from "@devfellowship/ux-paths-capture/playwright";

/**
 * The Playwright test OPTION that tells a capture suite which viewport it is
 * running at.
 *
 * ⚠️ An option and not an env var. A `process.env.CAPTURE_VIEWPORT` would be
 * process-wide, so the `manifest` and `manifest-mobile` projects could not run
 * in ONE `playwright test` invocation — and running them in one invocation is
 * what makes them share the single `webServer` and pay for the `vite build`
 * once. That saving is the stated reason `playwright.stamp.config.ts` uses
 * projects instead of a fourth config file; an env var would quietly undo it.
 *
 * Declared here rather than in the spec so that `playwright.stamp.config.ts`
 * can type its `use` block with it (`defineConfig<CaptureViewportOptions>`).
 */
export interface CaptureViewportOptions {
  captureViewport: PresetName;
}

/**
 * Install the deterministic environment. Must be called BEFORE the first
 * navigation: the init script runs on every document in the context, but only
 * for documents created after it is added.
 */
export async function freezeForCapture(page: Page): Promise<void> {
  await installDeterminism(page, { epoch: FROZEN_EPOCH_MS });
}

/**
 * Bring one navigated page to a still state.
 *
 * The font check is the part that cannot live in the package: a face that
 * arrives after the box is measured re-flows the text under the rect already
 * recorded. `document.fonts.ready` covers the faces the page actually
 * requested; the explicit checks name the two THIS app's first paint always
 * needs (see the preload block in `index.html`), so a vendoring regression
 * fails here instead of showing up as a 1px diff.
 */
export async function settleForCapture(page: Page): Promise<void> {
  await applyFreezeStylesheet(page);

  await page.evaluate(async () => {
    await document.fonts.ready;
    document.fonts.check('400 16px "Inter"');
    document.fonts.check('700 24px "Barlow Condensed"');
  });

  await page.evaluate(() => window.scrollTo(0, 0));

  // Two frames: the first flushes the style/scroll write, the second proves a
  // frame was rendered with it applied.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );

  // A fixed, unconditional quiet period. Deliberately a constant and not a
  // network-idle wait: `networkidle` is timing-dependent, so it would make the
  // capture depend on the very thing this is trying to remove.
  //
  // ⚠️ 300ms is a GUESS, not a measurement, and it is honest to say so. It is
  // sufficient for a screen reached by a plain navigation, which is every
  // screen `capture-regions.spec.ts` shoots. It is NOT sufficient for a screen
  // reached by INTERACTION — see `settleUntilStable` below and the numbers in
  // its header.
  await page.waitForTimeout(300);
}

/**
 * The MEASURED stop condition: shoot only when two consecutive frames are
 * byte-identical.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A SECOND SETTLE RULE EXISTS, AND WHY IT IS NOT THE DEFAULT
 * ═══════════════════════════════════════════════════════════════════════════
 * `settleForCapture` ends in a fixed 300ms wait. That is enough for a screen
 * reached by `page.goto`, because the navigation itself already waited. It is
 * not enough for a screen reached by INTERACTION — the states in
 * `e2e/support/capture-manifest.json` are reached by filling a form and
 * clicking, and the error banner they photograph appears only when a request
 * to the stub origin REJECTS. That rejection is DNS-bound, so its arrival time
 * is a property of the host, not of the app.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED, AND WHAT IT ACTUALLY SHOWED
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-13, this tree, `pollMs: 120`, 4 consecutive runs of
 * `--project manifest`, 14 measurements per run = 56 in total, over the 7
 * navigable routes and the 5 interaction states:
 *
 *   frames until two consecutive screenshots matched: **2, every single time.**
 *   Never 3. Not once, in either kind of screen.
 *
 * ⚠️ Read that result honestly, because it is NOT "the interaction case needed
 * a longer wait after all". It is the opposite, and the reason is the
 * interesting part: the manifest suite waits for the state's own PROOF
 * SELECTOR to be visible before it captures. That is a CONTENT-based stop
 * condition — the error banner is on screen, or the test has already failed —
 * and by the time it is satisfied the screen has stopped moving. The proof
 * selector is doing the settling. This function only measures that it did.
 *
 * So the value here is not the waiting. It is the ASSERTION: it converts "we
 * hope 300ms was enough" into "two consecutive frames were identical", which
 * is a fact the run can fail on. `stable === false` is a real failure mode the
 * suite checks for and has never yet seen — and the day a screen starts
 * needing 3 frames, the number is in
 * `e2e/artifacts/manifest/stability-frames/` instead of showing up months later
 * as a flaky byte-identity test.
 *
 * ⚠️ And note what this does NOT license: 2 frames is measured on THIS host,
 * where the stub origin fails DNS resolution almost instantly. A host whose
 * resolver holds the request longer would paint the error later. That is
 * exactly why the stop condition is the proof selector and not a frame count.
 *
 * `settleForCapture`'s fixed 300ms is deliberately left alone: the navigation
 * case measured 2 frames as well, so adding a poll loop there would spend an
 * extra screenshot per capture to re-prove a settled fact.
 *
 * ⚠️ This function returns rather than throws when it runs out of attempts.
 * The caller decides: the manifest suite fails on `stable === false`, because
 * a state that never stops moving is a state that cannot be diffed — but a
 * future consumer that only wants a best-effort image should not be forced to
 * crash. `frames` is reported so a screen that starts creeping toward the
 * limit is visible before it hits it.
 *
 * 📦 It stays HERE and not in the package on purpose. The package owns
 * everything that is the same for every application; the SETTLE POLICY is
 * exactly the thing it declines to own, because one app waits on a proof
 * selector, another shoots until two frames match, and a third has to stub an
 * auth gate first. The measurement above is about this app's screens.
 */
export interface StabilityResult {
  /** The image the last two attempts agreed on. */
  png: Buffer;
  /** How many screenshots were taken. 2 is the floor. */
  frames: number;
  /** False when `maxFrames` ran out before two matched. */
  stable: boolean;
}

export async function settleUntilStable(
  page: Page,
  options: { maxFrames?: number; pollMs?: number } = {}
): Promise<StabilityResult> {
  const maxFrames = options.maxFrames ?? 8;
  const pollMs = options.pollMs ?? 120;

  const shoot = () =>
    page.screenshot({ fullPage: false, animations: "disabled", caret: "hide", scale: "css" });

  let previous = await shoot();
  for (let frames = 2; frames <= maxFrames; frames += 1) {
    await page.waitForTimeout(pollMs);
    const current = await shoot();
    if (current.equals(previous)) return { png: current, frames, stable: true };
    previous = current;
  }
  return { png: previous, frames: maxFrames, stable: false };
}

/** Collect the regions of the currently displayed page, without an image. */
export async function collectRegions(page: Page, options: { root?: string } = {}) {
  return collectRegionsFromPage(page, { root: options.root ?? REPO_ROOT });
}

export interface CaptureOptions {
  /** Directory to write `screenshot.png` and `regions.json` into. */
  outDir: string;
  /** Logical screen name, recorded in the envelope. */
  screen: string;
  /** Repository root for resolving stamps. Defaults to this repository. */
  root?: string;
  /**
   * Use the MEASURED stop condition (`settleUntilStable`) instead of the single
   * shot. Costs one extra screenshot in the good case. Turn it on for a screen
   * reached by INTERACTION, where the fixed wait in `settleForCapture` is a
   * guess; leave it off for a screen reached by navigation, where it is not.
   */
  stabilise?: boolean;
}

export interface CaptureResult {
  outDir: string;
  pngPath: string;
  jsonPath: string;
  png: Buffer;
  manifest: RegionsFile;
  /** Present only when `stabilise` was asked for. See `settleUntilStable`. */
  stability?: { frames: number; stable: boolean };
}

/**
 * Settle, shoot, map, write.
 *
 * The order matters: the rects are read AFTER the screenshot, so anything the
 * screenshot itself perturbs is already perturbed when the boxes are measured.
 * That ordering lives in the package; what is here is the settle policy above
 * and the screenshot options this app takes its shot with.
 */
export async function captureScreen(
  page: Page,
  options: CaptureOptions
): Promise<CaptureResult> {
  await settleForCapture(page);

  let stability: { frames: number; stable: boolean } | undefined;
  let png: Buffer;
  if (options.stabilise) {
    const result = await settleUntilStable(page);
    png = result.png;
    stability = { frames: result.frames, stable: result.stable };
  } else {
    png = await page.screenshot({
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  }

  const pair = await writeCapturePair(page, {
    outDir: options.outDir,
    screen: options.screen,
    root: options.root ?? REPO_ROOT,
    png,
    capturedAtMs: FROZEN_EPOCH_MS,
  });

  return { ...pair, png, stability };
}
