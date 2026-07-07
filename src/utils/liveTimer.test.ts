import { describe, it, expect } from 'vitest';
import { parseTimerEvent, timerAfterStop } from './liveTimer';
import type { ClassTimer } from '@/types/liveClass';

describe('parseTimerEvent', () => {
  it('accepts a well-formed payload', () => {
    expect(parseTimerEvent({ activity_id: 'a1', deadline: 1000 })).toEqual({
      activityId: 'a1',
      deadline: 1000,
    });
  });

  it('rejects malformed payloads', () => {
    expect(parseTimerEvent(null)).toBeNull();
    expect(parseTimerEvent({ activity_id: 'a1' })).toBeNull();
    expect(parseTimerEvent({ activity_id: 1, deadline: 1000 })).toBeNull();
    expect(parseTimerEvent({ activity_id: 'a1', deadline: '1000' })).toBeNull();
  });
});

describe('timerAfterStop', () => {
  const running: ClassTimer = { activityId: 'a1', deadline: 1000 };

  it('clears the timer when the stop targets the running activity', () => {
    expect(timerAfterStop(running, { activity_id: 'a1' })).toBeNull();
  });

  it('preserves the timer when the stop targets another activity', () => {
    expect(timerAfterStop(running, { activity_id: 'a2' })).toBe(running);
  });

  it('preserves state on a malformed stop payload', () => {
    expect(timerAfterStop(running, null)).toBe(running);
    expect(timerAfterStop(null, { activity_id: 'a1' })).toBeNull();
  });
});
