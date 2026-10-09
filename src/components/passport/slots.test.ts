import { describe, expect, it } from 'vitest';
import { passportSlots } from '@/components/passport/slots';

describe('passportSlots', () => {
  it('marks filled slots and the next one', () => {
    const slots = passportSlots(5, 2);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.filled)).toEqual([true, true, false, false, false]);
    expect(slots.findIndex((s) => s.next)).toBe(2);
  });

  it('has no next slot when the page is complete', () => {
    expect(passportSlots(3, 3).some((s) => s.next)).toBe(false);
  });

  it('centres a single slot and shrinks long trails', () => {
    expect(passportSlots(1, 0)[0].cx).toBe(125);
    expect(passportSlots(10, 0)[0].r).toBeLessThan(26);
  });

  it('keeps every slot inside the area', () => {
    for (const s of passportSlots(12, 4)) {
      expect(s.cx - s.r).toBeGreaterThanOrEqual(0);
      expect(s.cx + s.r).toBeLessThanOrEqual(250);
    }
  });
});

describe('passportSlots spacing', () => {
  it('never lets neighbouring stamps touch', () => {
    for (const n of [2, 3, 5, 7, 10, 12]) {
      const s = passportSlots(n, 0);
      for (let i = 1; i < n; i++) expect(Math.hypot(s[i].cx - s[i - 1].cx, s[i].cy - s[i - 1].cy)).toBeGreaterThan(s[i].r * 2 + 2);
    }
  });
});
