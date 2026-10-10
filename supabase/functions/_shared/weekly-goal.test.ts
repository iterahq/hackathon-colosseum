import { describe, expect, it } from 'vitest';
import { isoWeekOf, weekLabel, weekRefId, weeklyGoalHits } from './weekly-goal.ts';

const ZONE = 'America/Sao_Paulo';
/** `count` completions one minute apart, starting at `start`. */
const burst = (start: string, count: number) => Array.from({ length: count }, (_, index) => new Date(new Date(start).getTime() + index * 60_000).toISOString());

describe('isoWeekOf', () => {
  it('follows ISO-8601 at year boundaries', () => {
    expect(isoWeekOf('2026-10-10')).toEqual({ year: 2026, week: 41 });
    expect(isoWeekOf('2026-10-12')).toEqual({ year: 2026, week: 42 });
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2024-12-30')).toEqual({ year: 2025, week: 1 });
  });

  it('gives each week a stable uuid and label', () => {
    expect(weekLabel({ year: 2026, week: 5 })).toBe('2026-W05');
    expect(weekRefId({ year: 2026, week: 41 })).toBe('7765656b-2026-4041-8000-000000000000');
    expect(weekRefId({ year: 2026, week: 41 })).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('weeklyGoalHits', () => {
  it('is empty below the goal', () => {
    expect(weeklyGoalHits(burst('2026-10-07T15:00:00Z', 19), ZONE)).toEqual([]);
  });

  it('hits at the twentieth completion, once for the week', () => {
    const hits = weeklyGoalHits(burst('2026-10-07T15:00:00Z', 25), ZONE);
    expect(hits).toEqual([{ ref_id: '7765656b-2026-4041-8000-000000000000', week: '2026-W41', earned_at: '2026-10-07T15:19:00.000Z', count: 20 }]);
  });

  it('counts only the trailing seven days', () => {
    const spread = [...burst('2026-09-28T15:00:00Z', 10), ...burst('2026-10-07T15:00:00Z', 10)];
    expect(weeklyGoalHits(spread, ZONE)).toEqual([]);
    const close = [...burst('2026-10-01T15:00:00Z', 10), ...burst('2026-10-07T15:00:00Z', 10)];
    expect(weeklyGoalHits(close, ZONE).map((hit) => hit.week)).toEqual(['2026-W41']);
  });

  it('awards two different weeks separately', () => {
    const two = [...burst('2026-09-30T15:00:00Z', 20), ...burst('2026-10-08T15:00:00Z', 20)];
    expect(weeklyGoalHits(two, ZONE).map((hit) => hit.week)).toEqual(['2026-W40', '2026-W41']);
  });

  it('places a late-Sunday completion in the São Paulo week, not the UTC one', () => {
    // 2026-10-12T01:30Z is still Sunday 22:30 in São Paulo: week 41.
    const hits = weeklyGoalHits(burst('2026-10-12T01:00:00Z', 20), ZONE);
    expect(hits[0].week).toBe('2026-W41');
    expect(weeklyGoalHits(burst('2026-10-12T01:00:00Z', 20), 'UTC')[0].week).toBe('2026-W42');
  });

  it('does not depend on the order of the rows and ignores malformed dates', () => {
    const rows = [...burst('2026-10-07T15:00:00Z', 20), 'not a date'].reverse();
    expect(weeklyGoalHits(rows, ZONE)).toHaveLength(1);
  });
});
