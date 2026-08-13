/**
 * The stamp's own behaviour is tested where it lives — in
 * `@devfellowship/ux-paths-capture`, which covers the gate, the line invariant
 * that makes `map: null` honest, idempotence, and what is and is not stamped.
 * Restating those here would be the duplicate this repository just deleted.
 *
 * What is NOT covered there is the one thing that is local: **this repository's
 * switch is `ITERA_SOURCE_STAMP`, not the package default.** That is the part a
 * migration can silently get wrong, and the failure is quiet in the worst way —
 * a capture build with no stamps produces screenshots with an EMPTY region map,
 * and every job stays green.
 *
 * So this file tests the WIRING, and only the wiring.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_SOURCE_STAMP_ENV } from "@devfellowship/ux-paths-capture";
import { SOURCE_STAMP_ENV, sourceStamp } from "./source-stamp";

describe("this repository's switch", () => {
  it("is ITERA_SOURCE_STAMP", () => {
    expect(SOURCE_STAMP_ENV).toBe("ITERA_SOURCE_STAMP");
  });

  it("is NOT the package default, and the two must not be confused", () => {
    // Every CI step and the stamp Playwright config already export
    // `ITERA_SOURCE_STAMP`. Renaming it to the package default would not fail
    // loudly; it would produce an unstamped capture build.
    expect(SOURCE_STAMP_ENV).not.toBe(DEFAULT_SOURCE_STAMP_ENV);
  });

  it("is off for an empty environment, and off for a production build", () => {
    // A capture build IS a production-mode build, so no test on the mode can
    // separate them. The env var is the only gate.
    expect(sourceStamp({ root: "/repo", env: {} })).toBeUndefined();
    expect(sourceStamp({ root: "/repo", env: { NODE_ENV: "production" } })).toBeUndefined();
  });

  it("turns on for ITERA_SOURCE_STAMP and ONLY for it", () => {
    expect(sourceStamp({ root: "/repo", env: { [SOURCE_STAMP_ENV]: "1" } })).toBeDefined();
    // The package default must not turn this build on: a job that exported the
    // wrong name would otherwise look like it worked.
    expect(sourceStamp({ root: "/repo", env: { [DEFAULT_SOURCE_STAMP_ENV]: "1" } })).toBeUndefined();
  });

  it("stamps a repository-relative path when it is on", () => {
    const plugin = sourceStamp({ root: "/repo", env: { [SOURCE_STAMP_ENV]: "1" } });
    const transform = plugin!.transform as unknown as (
      code: string,
      id: string,
    ) => { code: string; map: null } | null;
    const out = transform("export const X = () => <div />;\n", "/repo/src/pages/X.tsx");
    expect(out?.code).toContain('data-source="src/pages/X.tsx:1"');
  });
});
