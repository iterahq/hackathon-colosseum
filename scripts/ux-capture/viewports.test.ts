/**
 * THE PIN THAT MAKES THE RESTATEMENT SAFE.
 *
 * `scripts/ux-capture/viewports.ts` restates the viewport vocabulary that
 * `@devfellowship/ux-paths-capture` owns, because the two publish scripts run
 * with no `node_modules` (the header of that file explains why, and the
 * "Set up Node for publishing" step of `.github/workflows/ux-capture.yml` is
 * the evidence).
 *
 * A second copy of a contract is only acceptable while something compares it to
 * the first. This is that something, and it runs in `npm test`, where the
 * package IS installed. The day the package adds a preset, changes a size, or
 * flips `isMobile`, this goes red naming the field — instead of the mobile
 * capture being published under a label the fleet no longer agrees with.
 *
 * ⚠️ The assertion is deliberately over the WHOLE preset table and not over the
 * two presets this repository happens to use. A preset added upstream and not
 * mirrored here is exactly the drift that would make `--viewport tablet`
 * capture fine and publish wrong.
 */
import { describe, expect, it } from "vitest";
import {
  VIEWPORT_PRESETS,
  DEFAULT_VIEWPORT_PRESET,
  captureDirName,
  screenshotMetaFor,
  viewportLabel,
} from "@devfellowship/ux-paths-capture/playwright";
import {
  DEFAULT_VIEWPORT,
  VIEWPORTS,
  captureDirNameFor,
  resolveViewportName,
  screenshotMetaForViewport,
  viewportLabelFor,
} from "./viewports";

const upstreamNames = Object.keys(VIEWPORT_PRESETS) as (keyof typeof VIEWPORT_PRESETS)[];

describe("the restated viewport table agrees with the package", () => {
  it("covers exactly the presets the package declares", () => {
    expect(Object.keys(VIEWPORTS).sort()).toEqual([...upstreamNames].sort());
  });

  it("names the same default", () => {
    expect(DEFAULT_VIEWPORT).toBe(DEFAULT_VIEWPORT_PRESET);
  });

  for (const name of upstreamNames) {
    describe(name, () => {
      const preset = VIEWPORT_PRESETS[name];

      it("has the same size", () => {
        expect(VIEWPORTS[name].width).toBe(preset.width);
        expect(VIEWPORTS[name].height).toBe(preset.height);
      });

      // The field that decides whether an image is a phone or a narrow
      // desktop, and the one a restatement is most likely to drop because it
      // is absent from the desktop preset rather than `false`.
      it("has the same isMobile", () => {
        expect(VIEWPORTS[name].isMobile).toBe(
          ("isMobile" in preset ? preset.isMobile : false) === true
        );
      });

      it("spells the label the same way", () => {
        expect(viewportLabelFor(name)).toBe(viewportLabel(preset));
      });

      it("names the same capture directory", () => {
        expect(captureDirNameFor("login", name)).toBe(captureDirName("login", name));
      });

      it("derives the same screenshots[] entry", () => {
        expect(screenshotMetaForViewport(name)).toEqual(screenshotMetaFor(name));
      });
    });
  }
});

describe("resolveViewportName", () => {
  it("defaults to the default viewport", () => {
    expect(resolveViewportName(null)).toBe(DEFAULT_VIEWPORT);
    expect(resolveViewportName(undefined)).toBe(DEFAULT_VIEWPORT);
  });

  // A typo must not fall back. A silent fallback publishes mobile pixels under
  // the desktop viewport, where the row reads as a desktop capture whose
  // layout changed a lot — a wrong answer that looks like a finding.
  it("throws on an unknown name instead of falling back", () => {
    expect(() => resolveViewportName("mobil")).toThrow(/unknown viewport/);
    expect(() => resolveViewportName("390x844")).toThrow(/unknown viewport/);
  });
});
