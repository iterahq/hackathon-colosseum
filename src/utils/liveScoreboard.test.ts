import { describe, expect, it } from 'vitest';
import { parseScoreboard, SCOREBOARD_MAX_ENTRIES } from './liveScoreboard';

describe('parseScoreboard', () => {
  it('lê o placar que o professor respondeu', () => {
    expect(
      parseScoreboard({
        entries: [
          { activityId: 'act-1', userId: 'ana', correct: true, elapsedMs: 900 },
          { activityId: 'act-2', userId: 'bruno', correct: false },
        ],
      })
    ).toEqual([
      { activityId: 'act-1', userId: 'ana', correct: true, elapsedMs: 900 },
      { activityId: 'act-2', userId: 'bruno', correct: false },
    ]);
  });

  it('descarta entrada malformada sem perder as boas', () => {
    const parsed = parseScoreboard({
      entries: [
        { activityId: 'act-1', userId: 'ana', correct: true },
        { activityId: '', userId: 'bruno', correct: true },
        { userId: 'carla', correct: true },
        { activityId: 'act-2', correct: true },
        null,
        { activityId: 'act-3', userId: 'dora', correct: true, elapsedMs: -5 },
        { activityId: 'act-4', userId: 'edu', correct: true, elapsedMs: Number.NaN },
      ],
    });
    expect(parsed).toEqual([
      { activityId: 'act-1', userId: 'ana', correct: true },
      { activityId: 'act-3', userId: 'dora', correct: true },
      { activityId: 'act-4', userId: 'edu', correct: true },
    ]);
  });

  it('trata payload sem entries como placar vazio', () => {
    expect(parseScoreboard(null)).toEqual([]);
    expect(parseScoreboard({})).toEqual([]);
    expect(parseScoreboard({ entries: 'nope' })).toEqual([]);
  });

  it('correct só é verdadeiro quando vem literalmente true', () => {
    const [entry] = parseScoreboard({
      entries: [{ activityId: 'act-1', userId: 'ana', correct: 'sim' }],
    });
    expect(entry.correct).toBe(false);
  });

  it('corta no teto em vez de recusar a resposta inteira', () => {
    const entries = Array.from({ length: SCOREBOARD_MAX_ENTRIES + 10 }, (_, i) => ({
      activityId: `act-${i}`,
      userId: 'ana',
      correct: true,
    }));
    expect(parseScoreboard({ entries })).toHaveLength(SCOREBOARD_MAX_ENTRIES);
  });
});
