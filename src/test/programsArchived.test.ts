import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A program is retired by stamping `archived_at`, and the ONLY thing that makes
 * that stamp mean anything is the filter this file pins. Drop it and every dead
 * pilot and `[TESTE]` program is back on the learner's home screen.
 */

const isFilter = vi.fn();
const order = vi.fn();
const select = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from }),
}));

import { getPrograms } from '@/services/programs.service';

beforeEach(() => {
  order.mockReset().mockResolvedValue({ data: [], error: null });
  isFilter.mockReset().mockReturnValue({ order });
  select.mockReset().mockReturnValue({ is: isFilter });
  from.mockReset().mockReturnValue({ select });
});

describe('getPrograms', () => {
  it('asks PostgREST for unarchived programs only', async () => {
    await getPrograms();
    expect(from).toHaveBeenCalledWith('programs');
    expect(isFilter).toHaveBeenCalledWith('archived_at', null);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('maps the rows it does get back, with derived counts', async () => {
    order.mockResolvedValueOnce({
      data: [
        {
          id: 'p1',
          tenant_id: 't-dfl-batch',
          slug: 'educar-mais',
          title_i18n: { pt: 'Educar+' },
          created_at: '2026-07-17T00:00:00Z',
          units: [{ id: 'u1', lessons: [{ id: 'l1', activities: [{ id: 'a1' }, { id: 'a2' }] }] }],
        },
      ],
      error: null,
    });

    const out = await getPrograms();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      slug: 'educar-mais',
      unitCount: 1,
      lessonCount: 1,
      activityCount: 2,
    });
  });

  it('throws on a PostgREST error instead of rendering an empty catalogue', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(getPrograms()).rejects.toThrow('boom');
  });
});
