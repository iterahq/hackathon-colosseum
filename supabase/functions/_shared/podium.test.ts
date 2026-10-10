import { describe, expect, it } from 'vitest';
import { isPodiumKey, podiumKey, podiumOf, podiumPositionOf, podiumState, rankParticipants, type PodiumData } from './podium.ts';

const answers = (userId: string, correct: number, wrong: number, elapsed = 1000) => [
  ...Array.from({ length: correct }, () => ({ user_id: userId, correct: true, elapsed_ms: elapsed })),
  ...Array.from({ length: wrong }, () => ({ user_id: userId, correct: false, elapsed_ms: elapsed })),
];

function data(overrides: Partial<PodiumData> = {}): PodiumData {
  return {
    attendance: ['ana', 'bia', 'caio', 'duda'].map((user_id) => ({ user_id })),
    answers: [...answers('ana', 3, 0), ...answers('bia', 2, 1), ...answers('caio', 1, 2), ...answers('duda', 0, 3)],
    names: { ana: 'Ana', bia: 'Bia', caio: 'Caio', duda: 'Duda' },
    guestIds: [],
    ...overrides,
  };
}

describe('rankParticipants (the report rule)', () => {
  it('orders by correct answers', () => {
    expect(rankParticipants(data()).map((entry) => entry.userId)).toEqual(['ana', 'bia', 'caio', 'duda']);
  });

  it('breaks a tie by answers given, then by time, then by name', () => {
    const tie = data({
      answers: [...answers('ana', 2, 0, 900), ...answers('bia', 2, 1, 900), ...answers('caio', 2, 0, 500), ...answers('duda', 2, 0, 900)],
    });
    expect(rankParticipants(tie).map((entry) => entry.userId)).toEqual(['bia', 'caio', 'ana', 'duda']);
  });

  it('lists someone who only attended, last, and names an unknown user by the id', () => {
    const ranked = rankParticipants(data({ attendance: [{ user_id: 'zed-0000-1111' }], names: {} }));
    expect(ranked.at(-1)).toMatchObject({ userId: 'zed-0000-1111', name: 'zed-0000', answered: 0 });
  });
});

describe('podiumOf', () => {
  it('gives the three places to the top three', () => {
    expect(podiumOf(data()).map((place) => [place.position, place.userId])).toEqual([[1, 'ana'], [2, 'bia'], [3, 'caio']]);
  });

  it('skips a guest without leaving the place empty', () => {
    expect(podiumOf(data({ guestIds: ['ana'] })).map((place) => [place.position, place.userId])).toEqual([[1, 'bia'], [2, 'caio'], [3, 'duda']]);
    expect(podiumOf(data({ guestIds: ['bia'] })).map((place) => [place.position, place.userId])).toEqual([[1, 'ana'], [2, 'caio'], [3, 'duda']]);
  });

  it('skips the instructor', () => {
    expect(podiumOf(data({ excludedIds: ['ana'] })).map((place) => place.userId)).toEqual(['bia', 'caio', 'duda']);
  });

  it('gives no place to someone who answered nothing', () => {
    const quiet = data({ answers: [...answers('ana', 1, 0), ...answers('bia', 0, 1)] });
    expect(podiumOf(quiet).map((place) => place.userId)).toEqual(['ana', 'bia']);
    expect(podiumOf(data({ answers: [] }))).toEqual([]);
  });

  it('carries the numbers the report shows', () => {
    expect(podiumOf(data())[1]).toEqual({ position: 2, userId: 'bia', correct: 2, answered: 3, totalMs: 3000 });
  });
});

describe('keys and state', () => {
  it('maps positions to keys both ways', () => {
    expect([1, 2, 3].map((position) => podiumKey(position as 1 | 2 | 3))).toEqual(['podium_1', 'podium_2', 'podium_3']);
    expect(podiumPositionOf('podium_2')).toBe(2);
    expect(podiumPositionOf('first_stamp')).toBeNull();
    expect(isPodiumKey('podium_3')).toBe(true);
    expect(isPodiumKey('podium_4')).toBe(false);
  });

  it('remembers the class and the place, in São Paulo days, with no person in it', () => {
    const state = podiumState({ position: 1, userId: 'ana', correct: 3, answered: 3, totalMs: 10 }, { title: { pt: 'Dia 1', en: 'Day 1' }, endedAt: '2026-10-10T02:30:00Z' }, 'America/Sao_Paulo');
    expect(state).toEqual({ position: 1, class_title: { pt: 'Dia 1', en: 'Day 1' }, class_date: '2026-10-09', correct: 3, answered: 3, time_zone: 'America/Sao_Paulo' });
    expect(JSON.stringify(state)).not.toContain('ana');
  });
});
