import { describe, it, expect } from 'vitest';
import { QUICK_DELTA_SECONDS, quickDeltaLabel, quickDeltaTestId } from './liveTimeChips';

describe('liveTimeChips', () => {
  it('offers both directions — subtracting is the whole point', () => {
    expect(QUICK_DELTA_SECONDS.some((s) => s < 0)).toBe(true);
    expect(QUICK_DELTA_SECONDS.some((s) => s > 0)).toBe(true);
  });

  it('labels seconds under a minute as seconds, and the rest in minutes', () => {
    expect(quickDeltaLabel(30)).toBe('+30s');
    expect(quickDeltaLabel(-30)).toBe('−30s');
    expect(quickDeltaLabel(60)).toBe('+1min');
    expect(quickDeltaLabel(-120)).toBe('−2min');
  });

  it('spells the sign out in the testid', () => {
    expect(quickDeltaTestId(30)).toBe('instructor-time-quick-plus-30');
    expect(quickDeltaTestId(-60)).toBe('instructor-time-quick-minus-60');
  });
});
