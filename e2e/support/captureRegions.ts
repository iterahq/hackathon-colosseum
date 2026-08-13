/**
 * THE CLICKABLE LAYER OF A SCREENSHOT — `screenshot.png` + `regions.json`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Tainan, 2026-08-13: a designer does not know which source file a UI element
 * belongs to before he asks. So we do not ask later — we record it at
 * SCREENSHOT TIME, while the DOM is live and the answer is free.
 *
 * `scripts/source-stamp.ts` puts `data-source="<file>:<line>"` on every host
 * element of a capture build. This module reads those stamps together with
 * each element's box and writes `regions.json` beside `screenshot.png`. A click
 * at (x, y) on the image then resolves to an exact file through
 * `resolveRegionAt()` — no model call, no repository clone on the reader's side.
 *
 * The two files are a PAIR. `regions.json` describes the geometry of exactly
 * one image, in that image's own pixel space. Neither is useful alone.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧊 PIXEL STABILITY IS A FEATURE OF THIS MODULE, NOT AN ACCIDENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Everything downstream compares two screenshots and asks whether the diff
 * reached zero. A capture that churns by one anti-aliased pixel makes that
 * question unanswerable, so the freezing is part of the contract and is TESTED
 * (`e2e/capture-regions.spec.ts` captures the same screen twice and requires
 * the two PNGs to be byte-identical).
 *
 * What is neutralised, and where:
 *
 * | source of churn        | neutralised by                                   |
 * |------------------------|--------------------------------------------------|
 * | viewport size          | `CAPTURE_CONTEXT_OPTIONS.viewport`, fixed, no `fullPage` |
 * | device pixel ratio     | `deviceScaleFactor: 1` + `scale: 'css'`           |
 * | colour scheme          | `colorScheme: 'dark'` (the app ships `<body class="dark">`) |
 * | CSS animation/transition | `reducedMotion`, a 0s override sheet, and Playwright's `animations: 'disabled'` |
 * | text caret blink       | `caret: 'hide'` + `caret-color: transparent`      |
 * | wall clock             | `Date`/`Date.now` frozen to `FROZEN_EPOCH_MS`     |
 * | time zone / locale     | `timezoneId: 'UTC'`, `locale: 'pt-BR'`            |
 * | `Math.random`          | seeded mulberry32                                 |
 * | `crypto` randomness    | seeded `getRandomValues` + counter `randomUUID`   |
 * | font swap (FOUT)       | `document.fonts.ready` + an explicit face check   |
 * | scroll offset          | scrolled to the origin before the shot            |
 * | lazy layout settle     | two `requestAnimationFrame`s + a fixed quiet wait  |
 * | curve/text rasterising | `CAPTURE_LAUNCH_ARGS` — the last one found, and the only one the layout freezing could not reach |
 *
 * ⚠️ **What is NOT neutralised, stated plainly.** Fonts themselves are already
 * self-hosted (`public/vendor/fonts/`, see `index.html`), so there is no CDN in
 * the loop — but GLYPH RASTERISATION still belongs to the host: a different
 * FreeType or fontconfig renders the same text with different anti-aliasing.
 * Two captures on ONE machine are therefore byte-identical, and that is what
 * this module's own suite asserts.
 *
 * ✅ Measured 2026-08-13, the cross-machine case turned out to hold too, for a
 * reason worth knowing: Chrome-for-Testing bundles its own Skia and FreeType,
 * and this app's fonts are self-hosted woff2 that the PAGE loads — so the host's
 * font stack never enters the raster at all. All 8 recorded pairs reproduced
 * byte-for-byte across a Debian 11 host, an Ubuntu 24.04 container, and a
 * `dfl-runner` VPS. The pixels follow the CHROMIUM REVISION, not the host.
 * Evidence and its limits: the header of `scripts/ux-capture/digests.mjs`.
 *
 * ⚠️ This module still promises only the one-machine case, and the suite still
 * asserts only that. The cross-machine result is an observation about the
 * current pin, not a contract — do not build a check on it here. `performance.now()` is deliberately left real: freezing it stalls
 * React's scheduler and any `requestAnimationFrame` loop, which trades a
 * cosmetic wobble for a hang.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE SHOT IS VIEWPORT-CLIPPED AND NOT `fullPage`
 * ═══════════════════════════════════════════════════════════════════════════
 * `getBoundingClientRect()` speaks VIEWPORT coordinates. A viewport shot at
 * `deviceScaleFactor: 1` therefore shares one coordinate space with the rects,
 * and `regions.json` needs no transform to be true. A `fullPage` shot does not:
 * Chromium resizes the viewport to take it, which moves `fixed`/`sticky`
 * elements and can mount content that was not mounted when the rects were read
 * — so the map would describe a layout the image does not show. Full-page
 * capture is a real want and a separate problem; it is deferred rather than
 * approximated. `scroll` is recorded in the envelope so a future full-page
 * variant can be told apart from this one by its data.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContextOptions, Page } from "@playwright/test";
import { componentAtLine, componentNameFromPath } from "../../scripts/component-at-line";

/** `package.json` declares `"type": "module"` — no `__dirname` here. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The attribute `scripts/source-stamp.ts` writes. One name, one place. */
export const SOURCE_ATTR = "data-source";

/**
 * 1280x800. 1280 is the width the repo already reasons about — it is the
 * `Desktop Chrome` width the other suites use and the width the feedback-footer
 * measurements were taken at — so a capture lands in the same layout bucket as
 * the assertions written against it. The height is 800 rather than 720 to fit
 * one more row of content without scrolling.
 */
export const CAPTURE_VIEWPORT = { width: 1280, height: 800 } as const;

/**
 * A fixed instant, in the past relative to any session the harness mints, so a
 * stubbed token always reads as valid. Any UI that prints a date prints this
 * one, every run.
 */
export const FROZEN_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

/** The seed for every in-page pseudo-random source. Arbitrary and fixed. */
const RANDOM_SEED = 0x1ce_a5e5;

/**
 * The deterministic browser, as `browser.newContext()` arguments.
 *
 * ⚠️ It is CONTEXT options and not a Playwright-config `use` block on purpose.
 * Two reasons, and the second is the one that matters:
 *
 *  1. `reducedMotion` is not a top-level test option in this Playwright
 *     version — inside a config it has to be buried in `contextOptions`, where
 *     a `devices[…]` preset's own top-level `viewport` silently outranks it.
 *  2. A real capture run is a SCRIPT, not a test suite. It will open a browser
 *     and call `newContext(CAPTURE_CONTEXT_OPTIONS)`. Keeping the definition in
 *     the shape that call needs means the suite exercises the same object the
 *     tool will use, instead of a config-shaped translation of it.
 */
/**
 * Chromium flags a capture must be LAUNCHED with. They cannot go in the context
 * options — a context is created inside an already-running browser, and
 * rasterisation is decided at launch.
 *
 * These were not chosen from a blog post. Measured on this tree, 2026-08-13:
 * with everything else frozen, the author-harness capture still differed
 * between two runs about ONE TIME IN THREE, by **19 pixels out of 1 024 000** —
 * every one a ±1 channel step on an anti-aliased rounded border (the search
 * pill's caps, the dashed card's corners), with `regions.json` byte-identical.
 * The LAYOUT was already deterministic; only the rasterisation of the curve
 * moved. Tile-level raster reuse is exactly that failure mode.
 *
 * ⚠️ Note what that frequency means: a stability check run ONCE would have
 * called this fixed two times out of three. `login` and `not-found` never
 * failed at all. Both facts are why the suite asserts every screen and why the
 * flags are here rather than "we could not reproduce it".
 *
 *  - `--disable-gpu` — rasterise on the CPU. The dominant fix; a GPU/SwiftShader
 *    path can legitimately return two different roundings for one curve.
 *  - `--disable-partial-raster` — re-raster the whole tile instead of reusing
 *    part of a previous one, so the result cannot depend on what was drawn
 *    before it.
 *  - `--disable-skia-runtime-opts` — no CPU-feature-dependent Skia paths, so a
 *    machine with different SIMD does not take a different code path.
 *  - `--force-color-profile=srgb` — the host's display profile stops leaking
 *    into the pixels.
 *  - `--disable-lcd-text`, `--disable-font-subpixel-positioning`,
 *    `--font-render-hinting=none` — grayscale antialiasing at integer
 *    positions. Subpixel text rendering is the other classic ±1 source.
 */
export const CAPTURE_LAUNCH_ARGS: string[] = [
  "--disable-gpu",
  "--disable-partial-raster",
  "--disable-skia-runtime-opts",
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--disable-font-subpixel-positioning",
  "--font-render-hinting=none",
];

export const CAPTURE_CONTEXT_OPTIONS: BrowserContextOptions = {
  viewport: { ...CAPTURE_VIEWPORT },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "reduce",
  timezoneId: "UTC",
  locale: "pt-BR",
};

/** One rendered element that carries a stamp, in the image's pixel space. */
export interface Region {
  /** Unique CSS path from `#root`, so a reader can re-find the element. */
  selector: string;
  /** Repository-relative source file, e.g. `src/pages/NotFound.tsx`. */
  file: string;
  /** 1-based line of the opening tag in `file`. */
  line: number;
  /** Enclosing React component. See `scripts/component-at-line.ts`. */
  componentName: string;
  /** Lowercased DOM tag, e.g. `div`. */
  tag: string;
  /** Viewport-space box, CSS pixels, rounded to 2 decimals. */
  rect: { x: number; y: number; width: number; height: number };
  /** `width * height`. Precomputed because every hit test sorts on it. */
  area: number;
  /** Ancestor count. Breaks ties between two boxes of equal area. */
  depth: number;
  /** Document order among the collected regions. The last tiebreak. */
  index: number;
}

/** The envelope written to `regions.json`. */
export interface RegionsFile {
  /** Bumped when the SHAPE changes, so a reader can refuse an unknown one. */
  version: 1;
  /** The logical screen name, e.g. `login`. Matches the directory. */
  screen: string;
  /** The URL captured, with the origin removed — origins move, paths do not. */
  path: string;
  /** The image these regions describe. Relative to this file. */
  screenshot: string;
  /** Frozen, so the file itself is byte-stable across runs. */
  capturedAt: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  /** Always `{x:0,y:0}` today; recorded so a full-page variant is detectable. */
  scroll: { x: number; y: number };
  /** How many stamped elements were dropped, and why. Honesty, not noise. */
  dropped: { zeroArea: number; offscreen: number };
  regions: Region[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * FREEZING
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The 0s-duration override. `animation-duration: 0s` and NOT `animation: none`:
 * `none` drops the element back to its pre-animation base style, which for a
 * Tailwind `animate-in` fade leaves it at `opacity: 0` — invisible, and a
 * screenshot of nothing is stable and useless. A zero duration runs the
 * animation to completion instead.
 */
const FREEZE_STYLESHEET = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
`;

/**
 * Install the deterministic environment. Must be called BEFORE the first
 * navigation: `addInitScript` runs on every document in the context, including
 * the SPA's own reloads, but only for documents created after it is added.
 */
export async function freezeForCapture(page: Page): Promise<void> {
  await page.addInitScript(
    ({ epoch, seed }: { epoch: number; seed: number }) => {
      /* ── clock ────────────────────────────────────────────────────────── */
      // A Proxy rather than a subclass: it forwards every static and keeps
      // `d instanceof Date` true, so nothing downstream can tell the
      // difference except by asking what time it is.
      const RealDate = Date;
      const FrozenDate = new Proxy(RealDate, {
        construct(target, args: unknown[]) {
          // `new Date(2020, 1, 1)` keeps its real meaning. Only the "what time
          // is it now" constructor is frozen.
          return args.length === 0
            ? new target(epoch)
            : Reflect.construct(target, args as ConstructorParameters<typeof Date>);
        },
        get(target, prop, receiver) {
          if (prop === "now") return () => epoch;
          return Reflect.get(target, prop, receiver);
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = FrozenDate;

      /* ── Math.random ──────────────────────────────────────────────────── */
      // mulberry32: 32 bits of state, uniform enough for a shuffle, and it
      // restarts identically on every document.
      let state = seed >>> 0;
      const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      Math.random = next;

      /* ── crypto ───────────────────────────────────────────────────────── */
      // Same reason as Math.random: an id that reaches the DOM as visible text
      // (or as a `key` that reorders a list) would move pixels between runs.
      try {
        const c = globalThis.crypto;
        if (c) {
          Object.defineProperty(c, "getRandomValues", {
            configurable: true,
            writable: true,
            value: <T extends ArrayBufferView>(buf: T): T => {
              const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
              for (let i = 0; i < view.length; i += 1) view[i] = Math.floor(next() * 256);
              return buf;
            },
          });
          let uuidCounter = 0;
          Object.defineProperty(c, "randomUUID", {
            configurable: true,
            writable: true,
            value: () => {
              uuidCounter += 1;
              const tail = String(uuidCounter).padStart(12, "0");
              return `00000000-0000-4000-8000-${tail}`;
            },
          });
        }
      } catch {
        /* a locked-down `crypto` is not worth failing a capture over */
      }
    },
    { epoch: FROZEN_EPOCH_MS, seed: RANDOM_SEED }
  );
  // The stylesheet is NOT added here. `addStyleTag` attaches to the document
  // that exists now, and a navigation replaces it — `settleForCapture` adds it
  // to the document actually being photographed.
}

/**
 * Bring one navigated page to a still state.
 *
 * The style tag is (re-)added here because `addStyleTag` attaches to the
 * CURRENT document and an SPA navigation in a fresh context has none when
 * `freezeForCapture` runs.
 */
export async function settleForCapture(page: Page): Promise<void> {
  await page.addStyleTag({ content: FREEZE_STYLESHEET });

  // Fonts first: a face that arrives after the box is measured re-flows the
  // text under the rect we already recorded. `document.fonts.ready` covers the
  // faces the page actually requested; the explicit checks name the two the
  // first paint always needs (see the preload block in `index.html`), so a
  // vendoring regression fails here instead of showing up as a 1px diff.
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
  // capture depend on the very thing we are trying to remove.
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
    page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide', scale: 'css' });

  let previous = await shoot();
  for (let frames = 2; frames <= maxFrames; frames += 1) {
    await page.waitForTimeout(pollMs);
    const current = await shoot();
    if (current.equals(previous)) return { png: current, frames, stable: true };
    previous = current;
  }
  return { png: previous, frames: maxFrames, stable: false };
}

/* ────────────────────────────────────────────────────────────────────────────
 * COLLECTION
 * ──────────────────────────────────────────────────────────────────────────── */

interface RawRegion {
  selector: string;
  value: string;
  tag: string;
  rect: { x: number; y: number; width: number; height: number };
  depth: number;
}

interface RawCollection {
  raw: RawRegion[];
  devicePixelRatio: number;
  scroll: { x: number; y: number };
  viewport: { width: number; height: number };
  dropped: { zeroArea: number; offscreen: number };
}

/**
 * Walk the live DOM and bring back one record per stamped element.
 *
 * Everything here runs IN THE PAGE, so it must be self-contained — no imports,
 * no closure over module scope.
 */
async function collectRaw(page: Page): Promise<RawCollection> {
  return page.evaluate((attr: string) => {
    /** A unique path from `#root` (or the first id above the element). */
    const cssPath = (el: Element): string => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const parent: Element | null = node.parentElement;
        if (!parent) {
          parts.unshift(node.tagName.toLowerCase());
          break;
        }
        const nth = Array.prototype.indexOf.call(parent.children, node) + 1;
        parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${nth})`);
        node = parent;
      }
      return parts.join(" > ");
    };

    const depthOf = (el: Element): number => {
      let d = 0;
      let node: Element | null = el.parentElement;
      while (node) {
        d += 1;
        node = node.parentElement;
      }
      return d;
    };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const raw: {
      selector: string;
      value: string;
      tag: string;
      rect: { x: number; y: number; width: number; height: number };
      depth: number;
    }[] = [];
    const dropped = { zeroArea: 0, offscreen: 0 };

    for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const r = el.getBoundingClientRect();

      if (r.width <= 0 || r.height <= 0) {
        dropped.zeroArea += 1;
        continue;
      }
      // Outside the frame this shot will contain. Kept out rather than kept
      // and flagged: a region the image does not show can only mis-answer a
      // click on that image.
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) {
        dropped.offscreen += 1;
        continue;
      }

      const round = (n: number) => Math.round(n * 100) / 100;
      raw.push({
        selector: cssPath(el),
        value,
        tag: el.tagName.toLowerCase(),
        rect: { x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height) },
        depth: depthOf(el),
      });
    }

    return {
      raw,
      devicePixelRatio: window.devicePixelRatio,
      scroll: { x: window.scrollX, y: window.scrollY },
      viewport: { width: vw, height: vh },
      dropped,
    };
  }, SOURCE_ATTR);
}

/** `src/pages/NotFound.tsx:16` -> the two halves, or `null` if malformed. */
export function parseStamp(value: string): { file: string; line: number } | null {
  const match = /^(.+):(\d+)$/.exec(value);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  return { file: match[1], line };
}

/** Read a repository file once per capture, whatever the stamp count. */
function makeFileReader(root: string) {
  const cache = new Map<string, string | null>();
  return (relPath: string): string | null => {
    if (cache.has(relPath)) return cache.get(relPath) ?? null;
    let text: string | null = null;
    try {
      // Reject anything that would escape the repository before touching disk.
      if (!path.isAbsolute(relPath) && !relPath.split("/").includes("..")) {
        text = readFileSync(path.join(root, relPath), "utf8");
      }
    } catch {
      text = null;
    }
    cache.set(relPath, text);
    return text;
  };
}

/**
 * Collect the regions of the currently displayed page.
 *
 * Exported on its own because a caller may want the map without the image.
 */
export async function collectRegions(
  page: Page,
  options: { root?: string } = {}
): Promise<Omit<RegionsFile, "version" | "screen" | "path" | "screenshot" | "capturedAt">> {
  const root = options.root ?? REPO_ROOT;
  const { raw, devicePixelRatio, scroll, viewport, dropped } = await collectRaw(page);
  const readFile = makeFileReader(root);

  const regions: Region[] = [];
  for (const item of raw) {
    const parsed = parseStamp(item.value);
    if (!parsed) continue;
    const code = readFile(parsed.file);
    const componentName = code
      ? componentAtLine(code, parsed.line, parsed.file).name
      : componentNameFromPath(parsed.file);

    regions.push({
      selector: item.selector,
      file: parsed.file,
      line: parsed.line,
      componentName,
      tag: item.tag,
      rect: item.rect,
      area: Math.round(item.rect.width * item.rect.height * 100) / 100,
      depth: item.depth,
      index: regions.length,
    });
  }

  return { viewport, devicePixelRatio, scroll, dropped, regions };
}

/* ────────────────────────────────────────────────────────────────────────────
 * HIT TESTING
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The region a click at (x, y) means, in the image's own pixel space.
 *
 * SMALLEST AREA WINS. Every stamped element is nested inside its stamped
 * ancestors, so a point is inside many regions at once and "the first match"
 * would always answer with the page shell. The smallest containing box is the
 * most specific thing under the cursor, which is what a designer pointed at.
 * Depth then document order break the remaining ties deterministically — a
 * wrapper that exactly matches its child's box is common, and answering it
 * randomly would make the same click resolve two ways.
 *
 * Returns `null` outside every region rather than guessing.
 */
export function resolveRegionAt(regions: Region[], x: number, y: number): Region | null {
  let best: Region | null = null;
  for (const region of regions) {
    const { rect } = region;
    if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) continue;
    if (
      best === null ||
      region.area < best.area ||
      (region.area === best.area && region.depth > best.depth) ||
      (region.area === best.area && region.depth === best.depth && region.index > best.index)
    ) {
      best = region;
    }
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────────
 * CAPTURE
 * ──────────────────────────────────────────────────────────────────────────── */

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
 * Settle, shoot, map, write. The order matters: the rects are read AFTER the
 * screenshot, so anything the screenshot itself perturbs is already perturbed
 * when the boxes are measured.
 */
export async function captureScreen(page: Page, options: CaptureOptions): Promise<CaptureResult> {
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

  const collected = await collectRegions(page, { root: options.root });

  const manifest: RegionsFile = {
    version: 1,
    screen: options.screen,
    // Origin removed: the preview port is an accident of the harness, and a
    // recorded origin would make two runs on two ports look like two screens.
    path: new URL(page.url()).pathname + new URL(page.url()).search,
    screenshot: "screenshot.png",
    // The FROZEN instant, not the real one. A real timestamp would make
    // `regions.json` differ on every run, which defeats diffing the pair.
    capturedAt: new Date(FROZEN_EPOCH_MS).toISOString(),
    ...collected,
  };

  await mkdir(options.outDir, { recursive: true });
  const pngPath = path.join(options.outDir, "screenshot.png");
  const jsonPath = path.join(options.outDir, "regions.json");
  await writeFile(pngPath, png);
  await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { outDir: options.outDir, pngPath, jsonPath, png, manifest, stability };
}
