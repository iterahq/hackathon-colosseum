import { describe, expect, it } from 'vitest';
import {
  LESSON_MISS_CAP,
  MAX_LIVES,
  REGEN_INTERVAL_SECONDS,
  applyLifePack,
  deriveStats,
  giftLife,
  grantLife,
  isUnlimited,
  lessonBonus,
  lessonBonusAttemptId,
  lifePackOf,
  livesView,
  loseLife,
  missAttemptId,
  missCharge,
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
    // A reserve above the maximum is never trimmed.
    expect(regenerate(state(9), T0).lives).toBe(9);
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
    expect(livesView(state(5), T0)).toEqual({ current: 5, max: 5, next_regen_at: null, regen_seconds: 0, regen_interval_seconds: REGEN_INTERVAL_SECONDS, bonus: 0, unlimited_until: null });
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
    // A reserve above the maximum is never trimmed.
    expect(regenerate(state(9), T0).lives).toBe(9);
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

describe('life packs', () => {
  it('the site maximum is 10', () => expect(MAX_LIVES).toBe(10));

  it('reads the pack an item describes', () => {
    expect(lifePackOf({ add_lives: 30 })).toEqual({ addLives: 30 });
    expect(lifePackOf({ unlimited_days: 30 })).toEqual({ unlimitedDays: 30 });
    expect(lifePackOf({})).toBeNull();
    expect(lifePackOf({ add_lives: 0 })).toBeNull();
    expect(lifePackOf({ add_lives: 1.5 })).toBeNull();
    expect(lifePackOf({ add_lives: 'ten' })).toBeNull();
    expect(lifePackOf(undefined)).toBeNull();
  });

  it('adds lives on top, passing the maximum', () => {
    expect(applyLifePack(state(3), { addLives: 10 }, T0).lives).toBe(13);
    const full = applyLifePack({ ...state(10), maxLives: 10 }, { addLives: 100 }, T0);
    expect(full.lives).toBe(110);
    expect(livesView(full, T0)).toMatchObject({ current: 110, max: 10, bonus: 100, regen_seconds: 0, next_regen_at: null });
  });

  it('counts the lives regenerated so far before adding', () => {
    expect(applyLifePack(state(3), { addLives: 10 }, after(REGEN_INTERVAL_SECONDS * 2)).lives).toBe(15);
  });

  it('regenerates only below the maximum: the reserve is spent first, then regeneration resumes', () => {
    let current = applyLifePack({ ...state(10), maxLives: 10 }, { addLives: 10 }, T0);
    expect(regenerate(current, after(REGEN_INTERVAL_SECONDS * 9)).lives).toBe(20);
    for (let index = 0; index < 11; index += 1) current = loseLife(current, T0);
    expect(current.lives).toBe(9);
    expect(regenerate(current, new Date(T0.getTime() + REGEN_INTERVAL_SECONDS * 1000)).lives).toBe(10);
  });

  it('a gift or a refill never trims a reserve', () => {
    expect(giftLife(state(30), T0).lives).toBe(30);
    expect(refillLives(state(30), T0).lives).toBe(30);
  });

  it('infinite lives: a mistake costs nothing while it runs, then costs a life again', () => {
    const bought = applyLifePack(state(4), { unlimitedDays: 30 }, T0);
    expect(bought.unlimitedUntil).toBe('2026-11-08T15:00:00.000Z');
    expect(isUnlimited(bought, T0)).toBe(true);
    expect(loseLife(bought, after(60)).lives).toBe(4);
    expect(livesView(bought, T0).unlimited_until).toBe('2026-11-08T15:00:00.000Z');
    const later = new Date('2026-11-08T15:00:01.000Z');
    expect(isUnlimited(bought, later)).toBe(false);
    expect(loseLife(bought, later).lives).toBe(4); // regenerated to the maximum (5) over the 30 days, then one lost
    expect(livesView(bought, later).unlimited_until).toBeNull();
  });

  it('infinite days stack on a pack that is still running', () => {
    const once = applyLifePack(state(4), { unlimitedDays: 30 }, T0);
    const twice = applyLifePack(once, { unlimitedDays: 30 }, after(3600));
    expect(twice.unlimitedUntil).toBe('2026-12-08T15:00:00.000Z');
  });
});

describe('missCharge', () => {
  it('charges the first miss of an activity in a day', () => {
    expect(missCharge({ chargedForActivityToday: false, lessonLossesToday: 0 })).toBe('charged');
    expect(missCharge({ chargedForActivityToday: false, lessonLossesToday: LESSON_MISS_CAP - 1 })).toBe('charged');
  });

  it('charges an activity once a day, however many misses', () => {
    expect(missCharge({ chargedForActivityToday: true, lessonLossesToday: 1 })).toBe('already_charged');
  });

  it('stops at the cap of the lesson', () => {
    expect(missCharge({ chargedForActivityToday: false, lessonLossesToday: LESSON_MISS_CAP })).toBe('lesson_cap');
  });

  it('keys the charge by activity and local day', () => {
    const late = new Date('2026-10-10T02:30:00.000Z');
    expect(missAttemptId('ABC', late, ZONE)).toBe('miss:abc:2026-10-09');
    expect(missAttemptId('abc', new Date('2026-10-10T03:30:00.000Z'), ZONE)).toBe('miss:abc:2026-10-10');
  });
});
