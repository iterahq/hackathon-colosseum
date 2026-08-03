import { describe, it, expect } from 'vitest';
import {
  remainingSeconds,
  adjustedTimerSeconds,
  clampTimerSeconds,
  ADD_TIME_MAX_TOTAL_SECONDS,
  ADD_TIME_MIN_TOTAL_SECONDS,
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

  describe('adjustedTimerSeconds', () => {
    it('ADDS to the base (running: 40s left + 60s ⇒ 100s)', () => {
      expect(adjustedTimerSeconds(40, 60)).toBe(100);
    });

    it('ADDS to the base (stopped: pre-set 300s + 30s ⇒ 330s)', () => {
      expect(adjustedTimerSeconds(300, 30)).toBe(330);
    });

    it('SUBTRACTS on a negative delta (the 1min question the professor wanted at 30s)', () => {
      expect(adjustedTimerSeconds(60, -30)).toBe(30);
    });

    it('a zero delta is a no-op sum', () => {
      expect(adjustedTimerSeconds(90, 0)).toBe(90);
    });

    it('clamps the total to the 1h ceiling', () => {
      expect(adjustedTimerSeconds(3590, 120)).toBe(ADD_TIME_MAX_TOTAL_SECONDS);
      expect(adjustedTimerSeconds(ADD_TIME_MAX_TOTAL_SECONDS, 1)).toBe(ADD_TIME_MAX_TOTAL_SECONDS);
    });

    it('never subtracts the timer away — the floor keeps the control reachable', () => {
      expect(adjustedTimerSeconds(20, -60)).toBe(ADD_TIME_MIN_TOTAL_SECONDS);
      expect(adjustedTimerSeconds(0, -5)).toBe(ADD_TIME_MIN_TOTAL_SECONDS);
    });

    it('floors fractional inputs and treats a negative base as zero', () => {
      expect(adjustedTimerSeconds(40.9, 60.9)).toBe(100);
      expect(adjustedTimerSeconds(-10, 30)).toBe(30);
    });
  });

  describe('clampTimerSeconds', () => {
    it('keeps an absolute duration inside the floor/ceiling', () => {
      expect(clampTimerSeconds(30)).toBe(30);
      expect(clampTimerSeconds(1)).toBe(ADD_TIME_MIN_TOTAL_SECONDS);
      expect(clampTimerSeconds(99_999)).toBe(ADD_TIME_MAX_TOTAL_SECONDS);
      expect(clampTimerSeconds(Number.NaN)).toBe(ADD_TIME_MIN_TOTAL_SECONDS);
    });
  });
});
