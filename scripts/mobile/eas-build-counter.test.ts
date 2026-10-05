// @vitest-environment node
import { describe, it, expect } from "vitest";

interface Counter {
  decide(input: { used: number; max: number }): { next: number; allowed: boolean; reason: string };
  pickPlatformMetric(period: unknown, platform: string): { used: number; limit: number };
}

// A plain .mjs run by the workflow with no install; loaded by URL so the root `tsc` needs no types for it.
const mod = (await import(new URL("../../apps/mobile/scripts/eas-build-counter.mjs", import.meta.url).href)) as Counter;

const PERIOD = {
  planMetrics: [
    { serviceMetric: "BUILDS", platformBreakdown: { ios: { value: 4, limit: 15 }, android: { value: 11, limit: 15 } } },
    { serviceMetric: "LOCAL_BUILDS", platformBreakdown: null },
  ],
};

describe("eas-build-counter decide", () => {
  it("allows builds up to the hold and refuses the next one", () => {
    expect(mod.decide({ used: 0, max: 12 })).toMatchObject({ next: 1, allowed: true });
    expect(mod.decide({ used: 11, max: 12 })).toMatchObject({ next: 12, allowed: true });
    expect(mod.decide({ used: 12, max: 12 })).toMatchObject({ next: 13, allowed: false });
    expect(mod.decide({ used: 15, max: 12 }).allowed).toBe(false);
  });
});

describe("eas-build-counter pickPlatformMetric", () => {
  it("reads each platform separately", () => {
    expect(mod.pickPlatformMetric(PERIOD, "ios")).toEqual({ used: 4, limit: 15 });
    expect(mod.pickPlatformMetric(PERIOD, "android")).toEqual({ used: 11, limit: 15 });
  });

  it("fails closed on an unknown platform or a missing metric", () => {
    expect(() => mod.pickPlatformMetric(PERIOD, "web")).toThrow(/ios or android/);
    expect(() => mod.pickPlatformMetric({ planMetrics: [] }, "ios")).toThrow(/no ios BUILDS metric/);
    expect(() => mod.pickPlatformMetric(undefined, "android")).toThrow(/no android BUILDS metric/);
  });
});
