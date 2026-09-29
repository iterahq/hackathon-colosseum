import { describe, it, expect } from 'vitest';
import type { Program } from '@/types/content';
import { orderHomePrograms } from './orderHomePrograms';

const make = (
  slug: string,
  createdAt: string,
  completedCount: number,
  activityCount: number
): Program => ({
  id: slug,
  tenantId: 't',
  slug,
  title: { pt: slug },
  createdAt,
  completedCount,
  activityCount,
});

describe('orderHomePrograms', () => {
  it('puts started programs first, then newest-first, finished last', () => {
    const out = orderHomePrograms([
      make('old-demo', '2026-01-01T00:00:00Z', 0, 5),
      make('done', '2026-09-01T00:00:00Z', 4, 4),
      make('new-course', '2026-09-20T00:00:00Z', 0, 30),
      make('started-old', '2026-02-01T00:00:00Z', 2, 10),
      make('mid', '2026-05-01T00:00:00Z', 0, 3),
    ]);
    expect(out.map((p) => p.slug)).toEqual([
      'started-old',
      'new-course',
      'mid',
      'old-demo',
      'done',
    ]);
  });

  it('treats a program with no activities as not started, not finished', () => {
    const out = orderHomePrograms([
      make('empty', '2026-09-01T00:00:00Z', 0, 0),
      make('done', '2026-09-02T00:00:00Z', 1, 1),
    ]);
    expect(out.map((p) => p.slug)).toEqual(['empty', 'done']);
  });

  it('does not mutate the input', () => {
    const input = [make('a', '2026-01-01T00:00:00Z', 0, 1), make('b', '2026-02-01T00:00:00Z', 0, 1)];
    orderHomePrograms(input);
    expect(input.map((p) => p.slug)).toEqual(['a', 'b']);
  });
});
