/**
 * Unit tests for the PURE half of the capture: parsing a stamp, and turning a
 * coordinate into a region.
 *
 * `e2e/capture-regions.spec.ts` proves the same resolver against a real browser,
 * but it can only exercise the geometry a real screen happens to produce. The
 * tie-breaking rules are the part a downstream viewer depends on and a real
 * screen exercises by accident, so they are pinned here where the boxes can be
 * chosen: nested boxes, two boxes of identical area, and a point outside
 * everything.
 *
 * This file is `.test.ts`, not `.spec.ts` — Playwright globs `*.spec.ts` and
 * vitest is told about `e2e/support/**` in `vitest.config.ts`. Neither runner
 * can pick up the other's file.
 */
import { describe, expect, it } from "vitest";
import { parseStamp, resolveRegionAt, type Region } from "./captureRegions";

let nextIndex = 0;

/** A region with only the fields the resolver reads. */
function region(
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<Region> = {}
): Region {
  return {
    selector: `#root > div:nth-child(${nextIndex + 1})`,
    file: "src/X.tsx",
    line: 1,
    componentName: "X",
    tag: "div",
    rect: { x, y, width, height },
    area: width * height,
    depth: 1,
    index: nextIndex++,
    ...extra,
  };
}

describe("parseStamp", () => {
  it("splits a repository-relative path from its line", () => {
    expect(parseStamp("src/pages/NotFound.tsx:16")).toEqual({
      file: "src/pages/NotFound.tsx",
      line: 16,
    });
  });

  it("splits on the LAST colon, so a path containing one survives", () => {
    expect(parseStamp("src/weird:dir/A.tsx:7")).toEqual({ file: "src/weird:dir/A.tsx", line: 7 });
  });

  it("rejects a value with no line", () => {
    expect(parseStamp("src/pages/NotFound.tsx")).toBeNull();
  });

  it("rejects a non-positive line", () => {
    expect(parseStamp("src/A.tsx:0")).toBeNull();
  });
});

describe("resolveRegionAt", () => {
  it("returns null outside every region rather than guessing", () => {
    nextIndex = 0;
    expect(resolveRegionAt([region(0, 0, 10, 10)], 50, 50)).toBeNull();
    expect(resolveRegionAt([], 1, 1)).toBeNull();
  });

  it("answers the SMALLEST containing region, not the first", () => {
    nextIndex = 0;
    const shell = region(0, 0, 1280, 800, { file: "src/App.tsx", componentName: "App" });
    const card = region(100, 100, 400, 200, { file: "src/Card.tsx", componentName: "Card" });
    const label = region(120, 120, 80, 20, { file: "src/Label.tsx", componentName: "Label" });

    // `shell` is first in document order and contains the point. Answering it
    // would be the failure this rule exists to prevent.
    expect(resolveRegionAt([shell, card, label], 130, 130)?.file).toBe("src/Label.tsx");
    expect(resolveRegionAt([shell, card, label], 300, 200)?.file).toBe("src/Card.tsx");
    expect(resolveRegionAt([shell, card, label], 900, 700)?.file).toBe("src/App.tsx");
  });

  it("breaks an equal-area tie by DEPTH, so a wrapper yields to its child", () => {
    nextIndex = 0;
    const wrapper = region(0, 0, 100, 100, { depth: 3, file: "src/Wrapper.tsx" });
    const child = region(0, 0, 100, 100, { depth: 4, file: "src/Child.tsx" });
    expect(resolveRegionAt([wrapper, child], 50, 50)?.file).toBe("src/Child.tsx");
    // Order of the array must not change the answer.
    expect(resolveRegionAt([child, wrapper], 50, 50)?.file).toBe("src/Child.tsx");
  });

  it("breaks an equal-area, equal-depth tie by document order, deterministically", () => {
    nextIndex = 0;
    const first = region(0, 0, 100, 100, { depth: 2, file: "src/First.tsx" });
    const second = region(0, 0, 100, 100, { depth: 2, file: "src/Second.tsx" });
    expect(resolveRegionAt([first, second], 50, 50)?.file).toBe("src/Second.tsx");
    expect(resolveRegionAt([second, first], 50, 50)?.file).toBe("src/Second.tsx");
  });

  it("treats the box as half-open, so adjacent regions never both claim a pixel", () => {
    nextIndex = 0;
    const left = region(0, 0, 10, 10, { file: "src/Left.tsx" });
    const right = region(10, 0, 10, 10, { file: "src/Right.tsx" });
    expect(resolveRegionAt([left, right], 9.99, 5)?.file).toBe("src/Left.tsx");
    expect(resolveRegionAt([left, right], 10, 5)?.file).toBe("src/Right.tsx");
  });
});
