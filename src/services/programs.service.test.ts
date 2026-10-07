import { describe, it, expect, vi, beforeEach } from 'vitest';

const eq = vi.fn();
const is = vi.fn();
let result: { data: unknown; error: { message: string } | null };

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => {
          eq(...a);
          return {
            is: (...b: unknown[]) => {
              is(...b);
              return Promise.resolve(result);
            },
          };
        },
      }),
    }),
  }),
}));

const { getTenantLessons } = await import('./programs.service');

const lessonRow = (id: string, ordinal: number) => ({ id, ordinal, title_i18n: { en: id } });

beforeEach(() => {
  eq.mockReset();
  is.mockReset();
  result = { data: [], error: null };
});

describe('getTenantLessons', () => {
  it('filters by tenant and excludes archived programs', async () => {
    await getTenantLessons('T1');
    expect(eq).toHaveBeenCalledWith('tenant_id', 'T1');
    expect(is).toHaveBeenCalledWith('archived_at', null);
  });

  it('orders by program creation, then unit ordinal, then lesson ordinal', async () => {
    result = {
      data: [
        {
          id: 'p2',
          slug: 'second',
          title_i18n: { en: 'Second' },
          created_at: '2026-02-01',
          units: [{ id: 'u', ordinal: 1, lessons: [lessonRow('p2-l1', 1)] }],
        },
        {
          id: 'p1',
          slug: 'first',
          title_i18n: { en: 'First' },
          created_at: '2026-01-01',
          units: [
            { id: 'u2', ordinal: 2, lessons: [lessonRow('u2-l1', 1)] },
            { id: 'u1', ordinal: 1, lessons: [lessonRow('u1-l2', 2), lessonRow('u1-l1', 1)] },
          ],
        },
      ],
      error: null,
    };
    const lessons = await getTenantLessons('T1');
    expect(lessons.map((l) => l.id)).toEqual(['u1-l1', 'u1-l2', 'u2-l1', 'p2-l1']);
    expect(lessons[0]).toMatchObject({ programId: 'p1', programSlug: 'first', programTitle: { en: 'First' } });
  });

  it('throws the database error message', async () => {
    result = { data: null, error: { message: 'boom' } };
    await expect(getTenantLessons('T1')).rejects.toThrow('boom');
  });
});
