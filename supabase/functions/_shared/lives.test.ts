import { describe, expect, it } from 'vitest';
import {
  REGEN_INTERVAL_SECONDS,
  deriveStats,
  giftLife,
  grantLife,
  lessonBonus,
  lessonBonusAttemptId,
  livesView,
  loseLife,
  refillLives,
  regenerate,
  type LivesState,
} from './lives';

const T0 = new Date('2026-10-09T15:00:00.000Z');
const after = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const state = (lives: number, lastRegenAt = T0.toISOString()): LivesState => ({ lives, maxLives: 5, lastRegenAt });
const ZONE = 'America/Sao_Paulo';

describe('regeneration', () => {
  it('gives nothing one second before the interval and one life exactly on it', () => {
    expect(regenerate(state(2), after(REGEN_INTERVAL_SECONDS - 1)).lives).toBe(2);
    const onTime = regenerate(state(2), after(REGEN_INTERVAL_SECONDS));
    expect(onTime.lives).toBe(3);
    expect(onTime.lastRegenAt).toBe(after(REGEN_INTERVAL_SECONDS).toISOString());
  });

  it('keeps the remainder of a running interval', () => {
    const later = regenerate(state(1), after(REGEN_INTERVAL_SECONDS * 2 + 300));
    expect(later.lives).toBe(3);
    expect(later.lastRegenAt).toBe(after(REGEN_INTERVAL_SECONDS * 2).toISOString());
    expect(livesView(state(1), after(REGEN_INTERVAL_SECONDS * 2 + 300)).regen_seconds).toBe(REGEN_INTERVAL_SECONDS - 300);
  });

  it('stops at the maximum and restarts the clock there', () => {
    const full = regenerate(state(3), after(REGEN_INTERVAL_SECONDS * 50));
    expect(full.lives).toBe(5);
    expect(full.lastRegenAt).toBe(after(REGEN_INTERVAL_SECONDS * 50).toISOString());
  });

  it('survives a clock that went backwards and a stored value out of range', () => {
    expect(regenerate(state(2), after(-600)).lives).toBe(2);
    expect(regenerate(state(9), T0).lives).toBe(6);
    expect(regenerate(state(-3), T0).lives).toBe(0);
  });
});

describe('losing and gaining', () => {
  it('costs one life and starts the timer when dropping from full', () => {
    const idleFull = state(5, after(-86_400).toISOString());
    const hit = loseLife(idleFull, T0);
    expect(hit.lives).toBe(4);
    expect(livesView(hit, T0)).toMatchObject({ current: 4, max: 5, regen_seconds: REGEN_INTERVAL_SECONDS, next_regen_at: after(REGEN_INTERVAL_SECONDS).toISOString() });
  });

  it('never goes below zero', () => {
    let current = state(1);
    for (let index = 0; index < 4; index += 1) current = loseLife(current, T0);
    expect(current.lives).toBe(0);
  });

  it('regenerates before taking the life', () => {
    expect(loseLife(state(0), after(REGEN_INTERVAL_SECONDS * 2)).lives).toBe(1);
  });

  it('grants one life up to the maximum and refills to the maximum', () => {
    expect(grantLife(state(3), T0).lives).toBe(4);
    expect(grantLife(state(5), T0).lives).toBe(5);
    expect(refillLives(state(0), T0)).toEqual({ lives: 5, maxLives: 5, lastRegenAt: T0.toISOString() });
  });

  it('shows a full bar with no countdown', () => {
    expect(livesView(state(5), T0)).toEqual({ current: 5, max: 5, next_regen_at: null, regen_seconds: 0, regen_interval_seconds: REGEN_INTERVAL_SECONDS, bonus: 0 });
  });
});

describe('lesson bonus', () => {
  const facts = { mistakes: 0, lessonComplete: true, alreadyGrantedToday: false, lives: 3, maxLives: 5 };

  it('is granted once for a clean, completed lesson below the maximum', () => {
    expect(lessonBonus(facts)).toBe('granted');
    expect(lessonBonus({ ...facts, alreadyGrantedToday: true })).toBe('already_granted');
    expect(lessonBonus({ ...facts, mistakes: 1 })).toBe('mistakes');
    expect(lessonBonus({ ...facts, lessonComplete: false })).toBe('lesson_incomplete');
    expect(lessonBonus({ ...facts, lives: 5 })).toBe('full');
  });

  it('is keyed by lesson and local day', () => {
    const lesson = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
    expect(lessonBonusAttemptId(lesson, new Date('2026-10-10T02:30:00Z'), ZONE)).toBe(`lesson:${lesson}:2026-10-09`);
    expect(lessonBonusAttemptId(lesson, new Date('2026-10-10T03:30:00Z'), ZONE)).toBe(`lesson:${lesson}:2026-10-10`);
  });
});

describe('deriveStats', () => {
  const now = new Date('2026-10-09T18:00:00Z');
  const event = (created_at: string, amount = 50) => ({ amount, created_at });

  it('starts at level 1 with nothing', () => {
    expect(deriveStats([], now, ZONE)).toEqual({ level: 1, xp: 0, streak: 0 });
  });

  it('levels up every 200 xp', () => {
    expect(deriveStats([event('2026-10-01T12:00:00Z', 199)], now, ZONE).level).toBe(1);
    expect(deriveStats([event('2026-10-01T12:00:00Z', 200)], now, ZONE).level).toBe(2);
    expect(deriveStats([event('2026-10-01T12:00:00Z', 780)], now, ZONE)).toMatchObject({ level: 4, xp: 780 });
  });

  it('counts consecutive local days ending today', () => {
    const events = [event('2026-10-07T13:00:00Z'), event('2026-10-08T13:00:00Z'), event('2026-10-09T13:00:00Z'), event('2026-10-09T14:00:00Z')];
    expect(deriveStats(events, now, ZONE).streak).toBe(3);
    expect(deriveStats([event('2026-10-05T13:00:00Z'), ...events], now, ZONE).streak).toBe(3);
  });

  it('keeps yesterday`s run alive until today ends, then drops it', () => {
    const events = [event('2026-10-07T13:00:00Z'), event('2026-10-08T13:00:00Z')];
    expect(deriveStats(events, now, ZONE).streak).toBe(2);
    expect(deriveStats(events, new Date('2026-10-10T18:00:00Z'), ZONE).streak).toBe(0);
  });

  it('uses the local calendar day, not UTC', () => {
    // 02:00 UTC on the 9th is still the 8th in São Paulo.
    expect(deriveStats([event('2026-10-09T02:00:00Z')], new Date('2026-10-09T02:30:00Z'), ZONE).streak).toBe(1);
    expect(deriveStats([event('2026-10-09T02:00:00Z'), event('2026-10-09T12:00:00Z')], now, ZONE).streak).toBe(2);
  });
});

describe('bonus life', () => {
  it('a gift goes one above the maximum and no further', () => {
    expect(giftLife(state(3), T0).lives).toBe(4);
    expect(giftLife(state(5), T0).lives).toBe(6);
    expect(giftLife(state(6), T0).lives).toBe(6);
  });

  it('survives regeneration, a lesson bonus and a refill, and reports itself', () => {
    expect(regenerate(state(6), after(REGEN_INTERVAL_SECONDS * 9)).lives).toBe(6);
    expect(regenerate(state(9), T0).lives).toBe(6);
    expect(grantLife(state(6), T0).lives).toBe(6);
    expect(refillLives(state(6), T0).lives).toBe(6);
    expect(refillLives(state(2), T0).lives).toBe(5);
    expect(livesView(state(6), T0)).toMatchObject({ current: 6, max: 5, bonus: 1, regen_seconds: 0, next_regen_at: null });
    expect(livesView(state(4), T0).bonus).toBe(0);
  });

  it('is the first life a mistake takes, and regeneration then stops at the maximum', () => {
    const afterMistake = loseLife(state(6), T0);
    expect(afterMistake.lives).toBe(5);
    expect(regenerate(afterMistake, after(REGEN_INTERVAL_SECONDS * 3)).lives).toBe(5);
  });
});
