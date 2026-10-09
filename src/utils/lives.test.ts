import { describe, expect, it } from 'vitest';
import type { LivesState } from '@/types/shop';
import { formatCountdown, livesActive, loseLife, regenerate, secondsToNextLife, showLivesGate } from './lives';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const iso = (offsetSeconds: number) => new Date(NOW + offsetSeconds * 1000).toISOString();
const full: LivesState = { current: 5, max: 5, nextRegenAt: null, regenSeconds: 1200 };

describe('loseLife', () => {
  it('takes one life and starts the regeneration clock from a full bar', () => {
    expect(loseLife(full, NOW)).toEqual({ current: 4, max: 5, nextRegenAt: iso(1200), regenSeconds: 1200 });
  });

  it('keeps a clock that is already running', () => {
    const next = loseLife({ ...full, current: 3, nextRegenAt: iso(300) }, NOW);
    expect(next.current).toBe(2);
    expect(next.nextRegenAt).toBe(iso(300));
  });

  it('never goes below zero', () => {
    const empty = { ...full, current: 0, nextRegenAt: iso(60) };
    expect(loseLife(empty, NOW)).toBe(empty);
  });
});

describe('regenerate', () => {
  it('changes nothing before the tick', () => {
    const lives = { ...full, current: 2, nextRegenAt: iso(10) };
    expect(regenerate(lives, NOW)).toBe(lives);
  });

  it('adds one life when the tick has passed and schedules the next', () => {
    expect(regenerate({ ...full, current: 0, nextRegenAt: iso(-1) }, NOW)).toEqual({ ...full, current: 1, nextRegenAt: iso(1199) });
  });

  it('adds every tick that passed while away, capped at max', () => {
    expect(regenerate({ ...full, current: 1, nextRegenAt: iso(-2500) }, NOW).current).toBe(4);
    expect(regenerate({ ...full, current: 3, nextRegenAt: iso(-99999) }, NOW)).toEqual(full);
  });

  it('clears a stale clock on a full bar', () => {
    expect(regenerate({ ...full, nextRegenAt: iso(50) }, NOW)).toEqual(full);
  });
});

describe('countdown', () => {
  it('counts whole seconds to the next life and is zero when full', () => {
    expect(secondsToNextLife({ ...full, current: 4, nextRegenAt: iso(754) }, NOW)).toBe(754);
    expect(secondsToNextLife(full, NOW)).toBe(0);
    expect(secondsToNextLife({ ...full, current: 4, nextRegenAt: iso(-5) }, NOW)).toBe(0);
  });

  it('formats mm:ss', () => {
    expect(formatCountdown(754)).toBe('12:34');
    expect(formatCountdown(5)).toBe('00:05');
    expect(formatCountdown(-3)).toBe('00:00');
  });
});

describe('livesActive', () => {
  const learner = { signedIn: true, guest: false, harness: false, backendReady: true, broken: false };

  it('is on for a signed-in learner with a backend that answers', () => {
    expect(livesActive(learner)).toBe(true);
  });

  it.each([
    ['signed out', { signedIn: false }],
    ['a live-class guest', { guest: true }],
    ['the author harness', { harness: true }],
    ['a missing backend', { backendReady: false }],
    ['a backend that failed mid-lesson', { broken: true }],
  ])('is off for %s', (_name, patch) => {
    expect(livesActive({ ...learner, ...patch })).toBe(false);
  });
});

describe('showLivesGate', () => {
  const out = { active: true, lives: 0, reviewingVerdict: false, lessonCompleted: false };

  it('pauses the lesson at zero lives', () => {
    expect(showLivesGate(out)).toBe(true);
  });

  it('stays down while the mechanic is off, whatever the count', () => {
    expect(showLivesGate({ ...out, active: false })).toBe(false);
    expect(showLivesGate({ ...out, lives: null })).toBe(false);
  });

  it('stays down with lives left', () => {
    expect(showLivesGate({ ...out, lives: 1 })).toBe(false);
  });

  it('waits for the verdict to be read, and never covers the completion screen', () => {
    expect(showLivesGate({ ...out, reviewingVerdict: true })).toBe(false);
    expect(showLivesGate({ ...out, lessonCompleted: true })).toBe(false);
  });
});
