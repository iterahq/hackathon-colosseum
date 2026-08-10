import { describe, expect, it } from 'vitest';
import { parseScoreboard, SCOREBOARD_MAX_ENTRIES } from './liveScoreboard';
import { parseTimerEvent } from './liveTimer';

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

// A resposta de placar carrega o cronômetro de carona: numa aula `timer_gated`
// quem reconecta sem prazo fica read-only a rodada inteira, e broadcast não se
// repete. As duas leituras têm que conviver no MESMO payload.
describe('cronômetro de carona na resposta de placar', () => {
  const payload = {
    entries: [{ activityId: 'act-1', userId: 'ana', correct: true }],
    timer: { activity_id: 'act-1', deadline: 1_700_000_000_000 },
  };

  it('lê o placar e o prazo do mesmo payload', () => {
    expect(parseScoreboard(payload)).toHaveLength(1);
    expect(parseTimerEvent(payload.timer)).toEqual({
      activityId: 'act-1',
      deadline: 1_700_000_000_000,
    });
  });

  it('resposta sem cronômetro não inventa prazo nenhum', () => {
    expect(parseTimerEvent(null)).toBeNull();
    expect(parseTimerEvent({ activity_id: 'act-1' })).toBeNull();
  });
});
