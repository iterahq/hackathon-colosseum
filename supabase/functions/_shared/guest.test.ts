import { describe, expect, it } from 'vitest';
import { GUEST_LESSON_IDS, GUEST_RATE } from './guest';

describe('guest grading scope', () => {
  it('opens exactly the first lesson', () => {
    expect([...GUEST_LESSON_IDS]).toEqual(['0e7d6618-f9ba-46ba-bf28-71cf86f32716']);
  });

  it('is rate limited per address', () => {
    expect(GUEST_RATE.limit).toBeGreaterThan(0);
    expect(GUEST_RATE.limit).toBeLessThanOrEqual(600);
    expect(GUEST_RATE.windowMs).toBe(3_600_000);
  });
});
