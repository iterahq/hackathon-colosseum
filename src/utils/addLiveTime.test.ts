import { describe, it, expect } from 'vitest';
import {
  remainingSeconds,
  extendedTimerSeconds,
  ADD_TIME_MAX_TOTAL_SECONDS,
} from './addLiveTime';

describe('addLiveTime', () => {
  describe('remainingSeconds', () => {
    it('rounds up the whole seconds left before the deadline', () => {
      const now = 1_000_000;
      expect(remainingSeconds(now + 40_000, now)).toBe(40);
      expect(remainingSeconds(now + 40_500, now)).toBe(41); // rounds up
    });

    it('never returns a negative — an expired deadline is 0', () => {
      const now = 1_000_000;
      expect(remainingSeconds(now - 5_000, now)).toBe(0);
      expect(remainingSeconds(now, now)).toBe(0);
    });
  });

  describe('extendedTimerSeconds', () => {
    it('ADDS to the base (running: 40s left + 60s ⇒ 100s)', () => {
      expect(extendedTimerSeconds(40, 60)).toBe(100);
    });

    it('ADDS to the base (stopped: pre-set 300s + 30s ⇒ 330s)', () => {
      expect(extendedTimerSeconds(300, 30)).toBe(330);
    });

    it('a zero add is a no-op sum', () => {
      expect(extendedTimerSeconds(90, 0)).toBe(90);
    });

    it('clamps the total to the 1h ceiling', () => {
      expect(extendedTimerSeconds(3590, 120)).toBe(ADD_TIME_MAX_TOTAL_SECONDS);
      expect(extendedTimerSeconds(ADD_TIME_MAX_TOTAL_SECONDS, 1)).toBe(ADD_TIME_MAX_TOTAL_SECONDS);
    });

    it('floors fractional inputs and never goes below zero', () => {
      expect(extendedTimerSeconds(40.9, 60.9)).toBe(100);
      expect(extendedTimerSeconds(-10, 30)).toBe(30);
      expect(extendedTimerSeconds(0, -5)).toBe(0);
    });
  });
});
