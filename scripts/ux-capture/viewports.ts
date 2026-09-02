/**
 * THE VIEWPORT VOCABULARY, FOR THE TWO SCRIPTS THAT RUN WITH NO `node_modules`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS A RESTATEMENT, AND THAT IS DELIBERATE — READ WHY
 * ═══════════════════════════════════════════════════════════════════════════
 * `@devfellowship/ux-paths-capture` 0.3.0 owns this vocabulary. It exports
 * `VIEWPORT_PRESETS`, `captureContextOptions`, `captureDirName`,
 * `viewportLabel` and `screenshotMetaFor`, and every file in this repository
 * that CAN import the package does import it — `e2e/support/captureRegions.ts`,
 * `e2e/capture-manifest.spec.ts`, `prepass.mjs`, `verify-states.mjs`.
 *
 * Two files cannot. `publish-capture.mjs` and `emit-observed-flows.ts` run on
 * the CI runner AFTER the capture container has exited, with **no
 * `node_modules` installed at all** — see the "Set up Node for publishing" step
 * in `.github/workflows/ux-capture.yml` and the reasoning above it: an `npm ci`
 * there is ~640 packages plus a GitHub Packages token, and the step that
 * delivers the capture to the index must not be able to fail for a registry
 * reason. That is why `publish-capture.mjs` has zero dependencies and why the
 * emitter is run through Node's native type stripping instead of `tsx`.
 *
 * So the choice is not "import or restate". It is "restate, or make the
 * publish step depend on a package install". This file is the restatement, kept
 * to the SMALLEST possible surface — a size table and two derived strings.
 *
 * ⚠️ And the drift is not left to good intentions. `viewports.test.ts` asserts
 * every value here against the package's own exports, and it runs in `npm test`
 * where `node_modules` DOES exist. The day the package changes a preset, that
 * test goes red naming the field. A second copy that nothing compares is the
 * failure mode this design is avoiding; a second copy that a test pins is a
 * cache.
 *
 * ⚠️ Nothing about DETERMINISM is restated here — no launch flags, no
 * `colorScheme`, no `timezoneId`, no epoch. Those belong to the browser, the
 * browser only ever runs inside the container where the package IS installed,
 * and a second copy of a determinism setting is the thing that "stays green"
 * while diverging. This file describes SIZES and NAMES, which is all a
 * publisher needs to label an image it did not take.
 */

/** The size half of a preset. `isMobile` is what makes 390x844 a phone. */
export interface ViewportRecord {
  readonly width: number;
  readonly height: number;
  /** Mirrors the package's `isMobile`. It decides `platform`, not the width. */
  readonly isMobile: boolean;
}

/**
 * Every viewport a capture of this application is published under.
 *
 * Keyed by the name that appears in `--viewport`, in
 * `published-screens.json`, and in `engineering.ux_map_captures.viewport`.
 */
export const VIEWPORTS: Record<string, ViewportRecord> = {
  desktop: { width: 1280, height: 800, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

/**
 * The viewport a capture is published under when nobody asks for one.
 *
 * `desktop`, and every directory, digest and index row written before the
 * mobile pass existed is a desktop capture. The database column has the same
 * default, for the same reason (ADR-8).
 */
export const DEFAULT_VIEWPORT = "desktop";

export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Resolve a `--viewport` argument to a known name.
 *
 * Throws on anything unknown. A typo that silently fell back to `desktop`
 * would publish mobile pixels under the desktop viewport, where nothing
 * downstream could tell — the row would simply look like a desktop capture
 * whose layout changed a lot.
 */
export function resolveViewportName(spec: string | null | undefined): string {
  const name = (spec ?? DEFAULT_VIEWPORT).trim();
  if (!Object.prototype.hasOwnProperty.call(VIEWPORTS, name)) {
    throw new Error(
      `unknown viewport "${name}" — known: ${Object.keys(VIEWPORTS).join(", ")}`
    );
  }
  return name;
}

/** `390x844`. The one spelling of a viewport in a file name or a metadata field. */
export function viewportLabelFor(name: string): string {
  const preset = VIEWPORTS[resolveViewportName(name)];
  return `${preset.width}x${preset.height}`;
}

/**
 * The capture directory for one screen at one viewport, per ADR-3:
 * `<screen_id>` for the default viewport, `<screen_id>@<WxH>` for every other.
 */
export function captureDirNameFor(screenId: string, name: string): string {
  const resolved = resolveViewportName(name);
  return resolved === DEFAULT_VIEWPORT
    ? screenId
    : `${screenId}@${viewportLabelFor(resolved)}`;
}

/**
 * The `screens[].screenshots[]` entry a capture at this viewport describes.
 *
 * `platform` follows `isMobile`, never the width: a 390-wide DESKTOP context is
 * honestly `web`, and labelling it `mobile` would file a desktop layout under a
 * mobile key where no reader could tell. `orientation` follows the aspect
 * ratio, which is the only thing it can mean.
 *
 * Both fields are constrained by an enum in `schema/v1.json`, so a wrong value
 * here does not degrade quietly — the observed document stops validating and
 * the viewer refuses to load it.
 */
export function screenshotMetaForViewport(name: string): {
  platform: "web" | "mobile";
  orientation: "portrait" | "landscape";
  viewport: string;
} {
  const resolved = resolveViewportName(name);
  const preset = VIEWPORTS[resolved];
  return {
    platform: preset.isMobile ? "mobile" : "web",
    orientation: preset.height > preset.width ? "portrait" : "landscape",
    viewport: viewportLabelFor(resolved),
  };
}
