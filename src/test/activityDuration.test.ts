/**
 * Pins the meaning of the two duration numbers (plan
 * 20260731-itera-eventos-aprendizagem, Phase 1).
 *
 * These are not "does the arithmetic work" tests. Every case below is a
 * statement about what the column means, of the kind that a future reader will
 * otherwise have to reverse-engineer from a number: does a background tab count?
 * does an unmeasured attempt become zero? can the clock go backwards? The
 * COMMENT ON in migration 0033 makes those claims to whoever queries the table;
 * this file is what keeps them true.
 */
import { describe, it, expect } from 'vitest';
import {
  applyVisibility,
  sampleDuration,
  startTally,
  type HiddenTally,
} from '@/utils/activityDuration';

const T0 = 1_000_000;

describe('activityDuration', () => {
  it('measures wall clock from the origin to the read', () => {
    const tally = startTally(T0, false);
    expect(sampleDuration(T0, tally, T0 + 4_200)).toEqual({
      elapsedMs: 4_200,
      visibleMs: 4_200,
    });
  });

  it('returns NULL — not zero — when there is no origin', () => {
    // "Not measured" and "answered instantly" must never collapse into the same
    // stored value; the column is nullable precisely so they cannot.
    expect(sampleDuration(null, startTally(T0, false), T0 + 5_000)).toBeNull();
  });

  it('counts background time in elapsedMs but NOT in visibleMs', () => {
    // The whole reason visible_ms exists: 20 minutes in another tab is not 20
    // minutes of struggling with the activity.
    let tally = startTally(T0, false);
    tally = applyVisibility(tally, true, T0 + 1_000); // tab hidden at +1s
    tally = applyVisibility(tally, false, T0 + 21_000); // back at +21s
    expect(sampleDuration(T0, tally, T0 + 25_000)).toEqual({
      elapsedMs: 25_000,
      visibleMs: 5_000,
    });
  });

  it('counts a hidden stretch still in flight at read time', () => {
    // A learner can settle an answer with the page hidden (keyboard shortcut,
    // a race with the tab switch). The open stretch must not be dropped.
    const tally = applyVisibility(startTally(T0, false), true, T0 + 2_000);
    expect(sampleDuration(T0, tally, T0 + 10_000)).toEqual({
      elapsedMs: 10_000,
      visibleMs: 2_000,
    });
  });

  it('counts an activity opened while the tab was already hidden', () => {
    const tally = startTally(T0, true);
    expect(sampleDuration(T0, tally, T0 + 3_000)).toEqual({
      elapsedMs: 3_000,
      visibleMs: 0,
    });
  });

  it('sums multiple hidden stretches', () => {
    let tally: HiddenTally = startTally(T0, false);
    tally = applyVisibility(tally, true, T0 + 1_000);
    tally = applyVisibility(tally, false, T0 + 3_000); // 2s away
    tally = applyVisibility(tally, true, T0 + 5_000);
    tally = applyVisibility(tally, false, T0 + 9_000); // 4s away
    expect(sampleDuration(T0, tally, T0 + 10_000)).toEqual({
      elapsedMs: 10_000,
      visibleMs: 4_000,
    });
  });

  it('ignores a repeated transition into the state it is already in', () => {
    // visibilitychange genuinely fires on a non-change (bfcache restore, some
    // mobile browsers). Treating it as an edge would restart or double-count the
    // stretch — silently, and only for mobile learners.
    let tally = startTally(T0, false);
    tally = applyVisibility(tally, true, T0 + 1_000);
    tally = applyVisibility(tally, true, T0 + 4_000); // must NOT restart at +4s
    tally = applyVisibility(tally, false, T0 + 6_000);
    tally = applyVisibility(tally, false, T0 + 7_000); // must NOT re-close
    expect(sampleDuration(T0, tally, T0 + 8_000)).toEqual({
      elapsedMs: 8_000,
      visibleMs: 3_000,
    });
  });

  it('clamps a backwards clock to zero instead of storing a negative', () => {
    // Date.now() is wall clock and CAN jump back (NTP, the user changing the
    // system clock). A negative duration is noise, not a measurement.
    expect(sampleDuration(T0, startTally(T0, false), T0 - 5_000)).toEqual({
      elapsedMs: 0,
      visibleMs: 0,
    });
  });

  it('never reports more visible time than elapsed time', () => {
    // Guards the invariant the DB deliberately does NOT enforce (a constraint
    // violation there would reject the attempt row itself).
    const tally: HiddenTally = { accumMs: -50_000, hiddenSince: null };
    const sample = sampleDuration(T0, tally, T0 + 1_000)!;
    expect(sample.visibleMs).toBeLessThanOrEqual(sample.elapsedMs);
    expect(sample.visibleMs).toBe(1_000);
  });

  it('rounds to whole milliseconds', () => {
    const sample = sampleDuration(T0, startTally(T0, false), T0 + 1_234.6)!;
    expect(Number.isInteger(sample.elapsedMs)).toBe(true);
    expect(Number.isInteger(sample.visibleMs)).toBe(true);
  });
});
