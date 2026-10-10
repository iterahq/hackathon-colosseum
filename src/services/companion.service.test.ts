import { describe, expect, it } from 'vitest';
import { reviveLives } from '@/services/companion.service';
import type { LivesState } from '@/types/shop';

const base: LivesState = { current: 5, max: 5, nextRegenAt: null, regenSeconds: 1200 };

describe('reviveLives', () => {
  it('keeps the normalized lives when nothing new is on the wire', () => {
    expect(reviveLives({ current: 5, max: 5 }, base)).toBe(base);
  });

  it('reads max_lives 10, a reserve above the maximum and unlimited_until', () => {
    const lives = reviveLives({ current: 37, max_lives: 10, unlimited_until: '2099-01-01T00:00:00Z' }, base);
    expect(lives).toMatchObject({ current: 37, max: 10, nextRegenAt: null, unlimitedUntil: '2099-01-01T00:00:00Z' });
  });

  it('never lowers the count the normalizer gave', () => {
    expect(reviveLives({ current: 2 }, { ...base, current: 4 }).current).toBe(4);
  });

  it('keeps the regeneration clock below the maximum', () => {
    const lives = reviveLives({ current: 6, max_lives: 10 }, { ...base, current: 5, nextRegenAt: '2026-10-10T08:00:00Z' });
    expect(lives.nextRegenAt).toBe('2026-10-10T08:00:00Z');
  });
});
