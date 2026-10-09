import { describe, expect, it } from 'vitest';
import type { ProgressRow, SourceProgram } from '@/types/trailDashboard';
import { barFill, buildTrails, currentDayOf, pickFeatured, trailName, trailPath, weeklyCount } from '@/utils/trailDashboard';

const unit = (id: string, ordinal: number, title: string, lessons: Record<string, string[]>) => ({
  id,
  ordinal,
  title: { pt: title },
  lessons: Object.entries(lessons).map(([lessonId, activityIds], i) => ({ id: lessonId, ordinal: i, title: { pt: lessonId }, activityIds })),
});

const program = (slug: string, createdAt: string, units: ReturnType<typeof unit>[]): SourceProgram => ({ id: slug, slug, title: { pt: slug }, createdAt, units });

const done = (activityId: string, completedAt = '2026-10-01T10:00:00Z'): ProgressRow => ({ activityId, status: 'completed', completedAt });

const v2 = program('itera-v2', '2026-02-01T00:00:00Z', [
  unit('u-css', 1, 'Semana 2 · CSS', { l3: ['a3'], l4: ['a4', 'a5'] }),
  unit('u-html', 0, 'Semana 1 · HTML', { l1: ['a1'], l2: ['a2'] }),
  unit('u-js', 2, 'Semana 3 · JavaScript', { l5: ['a6'] }),
]);
const other = program('other', '2026-01-01T00:00:00Z', [unit('u-o', 0, 'Solo', { lo: ['o1'] })]);

describe('buildTrails', () => {
  it('orders itera-v2 first, then by program and ordinal', () => {
    const trails = buildTrails([other, v2], []);
    expect(trails.map((t) => t.id)).toEqual(['u-html', 'u-css', 'u-js', 'u-o']);
  });

  it('opens the first unit and locks the next until the previous is fully done', () => {
    const trails = buildTrails([v2], [done('a1')]);
    expect(trails.map((t) => t.status)).toEqual(['in_progress', 'locked', 'locked']);
    expect(trails[1].unlockedBy).toEqual({ pt: 'Semana 1 · HTML' });
  });

  it('unlocks the next unit once the previous one is done', () => {
    const trails = buildTrails([v2], [done('a1'), done('a2')]);
    expect(trails.map((t) => t.status)).toEqual(['done', 'fresh', 'locked']);
    expect(trails[0].days.map((d) => d.state)).toEqual(['done', 'done']);
    expect(trails[1].days.map((d) => d.state)).toEqual(['current', 'upcoming']);
  });

  it('marks the first unfinished lesson as current and counts partial lessons as not done', () => {
    const trails = buildTrails([v2], [done('a1'), done('a2'), done('a3'), done('a4')]);
    const css = trails[1];
    expect(css.days.map((d) => d.state)).toEqual(['done', 'current']);
    expect(css.doneActivities).toBe(2);
    expect(css.doneDays).toBe(1);
    expect(currentDayOf(css)?.id).toBe('l4');
  });

  it('ignores non-completed rows and drops lessons without activities', () => {
    const empty = program('p', '2026-01-01T00:00:00Z', [unit('u', 0, 'Solo', { a: ['x1'], b: [] })]);
    const trails = buildTrails([empty], [{ activityId: 'x1', status: 'in_progress', completedAt: null }]);
    expect(trails[0].days).toHaveLength(1);
    expect(trails[0].status).toBe('fresh');
  });
});

describe('pickFeatured', () => {
  it('returns the open trail with the most recent progress', () => {
    const trails = buildTrails([v2, other], [done('o1', '2026-10-05T00:00:00Z')]);
    expect(pickFeatured(trails)?.id).toBe('u-html');
    const two = buildTrails(
      [v2, program('p2', '2026-03-01T00:00:00Z', [unit('u-p2', 0, 'Two', { x: ['x1', 'x2'] })])],
      [done('a1', '2026-10-01T00:00:00Z'), done('x1', '2026-10-06T00:00:00Z')]
    );
    expect(pickFeatured(two)?.id).toBe('u-p2');
  });

  it('falls back to the first open trail, skips locked ones and returns null when all are done', () => {
    expect(pickFeatured(buildTrails([v2], []))?.id).toBe('u-html');
    expect(pickFeatured(buildTrails([other], [done('o1')]))).toBeNull();
    expect(pickFeatured([])).toBeNull();
  });
});

describe('weeklyCount and barFill', () => {
  it('counts completions of the last 7 days only', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');
    const rows = [done('a', '2026-10-08T00:00:00Z'), done('b', '2026-10-01T00:00:00Z'), { activityId: 'c', status: 'in_progress', completedAt: null }];
    expect(weeklyCount(rows, now)).toBe(1);
  });

  it('fills at least one tick for any progress and caps at the slots', () => {
    expect(barFill(0, 16)).toBe(0);
    expect(barFill(1, 100)).toBe(1);
    expect(barFill(2, 16)).toBe(2);
    expect(barFill(16, 16)).toBe(12);
  });
});

describe('trailName', () => {
  it('keeps what follows the first separator', () => {
    expect(trailName({ pt: 'Semana 2 · CSS', en: 'Week 2 · CSS' })).toEqual({ pt: 'CSS', en: 'CSS' });
    expect(trailName({ pt: 'Solo' })).toEqual({ pt: 'Solo' });
  });
});

describe('trailPath', () => {
  const opts = { W: 740, H: 150, A: 34, r: 30 };

  it('zig-zags the nodes and splits the line into done and live legs', () => {
    const p = trailPath(['done', 'done', 'current', 'upcoming'], opts);
    expect(p.nodes).toHaveLength(4);
    expect(p.nodes[0].cy).toBe(75 - 34);
    expect(p.nodes[1].cy).toBe(75 + 34);
    expect(p.nodes[0].cx).toBe(38);
    expect(p.nodes[3].cx).toBe(740 - 38);
    expect(p.done.match(/M/g)).toHaveLength(1);
    expect(p.live.match(/M/g)).toHaveLength(1);
  });

  it('gives the current node a ring and a label, and the upcoming ones a lock', () => {
    const p = trailPath(['current', 'upcoming'], opts);
    expect(p.nodes[0].ring).toBeGreaterThan(p.nodes[0].r);
    expect(p.nodes[0].label).toBe('01');
    expect(p.nodes[1].icon).toContain('a3 3');
    expect(p.live).toContain('L');
  });

  it('survives a single node and the vertical layout', () => {
    expect(trailPath(['current'], opts).nodes).toHaveLength(1);
    const v = trailPath(['done', 'current'], { W: 170, H: 300, A: 28, r: 26, vertical: true });
    expect(v.nodes[0].cx).toBe(85 - 28);
    expect(v.nodes[1].cy).toBeGreaterThan(v.nodes[0].cy);
  });
});
