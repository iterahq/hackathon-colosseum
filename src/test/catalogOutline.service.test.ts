import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * catalogOutline.service — syllabus of one catalog program via the SECURITY
 * DEFINER RPC itera.catalog_program_outline (migration 0102). The Supabase
 * client is mocked; we assert the RPC name/args and the flat-rows → tree
 * grouping.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ rpc }),
}));

import {
  getCatalogProgramOutline,
  groupCatalogOutlineRows,
} from '@/services/catalogOutline.service';

const program = {
  program_id: 'p1',
  program_slug: 'dominio-a-agente',
  program_title_i18n: { pt: 'Domínio a agente', en: 'Domain to agent' },
};

beforeEach(() => rpc.mockReset());

describe('groupCatalogOutlineRows', () => {
  it('groups lesson rows under their units, keeping the RPC order', () => {
    const out = groupCatalogOutlineRows([
      { ...program, unit_id: 'u1', unit_ordinal: 1, unit_title_i18n: { pt: 'U1' },
        lesson_id: 'l1', lesson_ordinal: 1, lesson_title_i18n: { pt: 'L1' }, lesson_activity_count: 5 },
      { ...program, unit_id: 'u1', unit_ordinal: 1, unit_title_i18n: { pt: 'U1' },
        lesson_id: 'l2', lesson_ordinal: 2, lesson_title_i18n: { pt: 'L2' }, lesson_activity_count: '2' },
      { ...program, unit_id: 'u2', unit_ordinal: 2, unit_title_i18n: { pt: 'U2' },
        lesson_id: 'l3', lesson_ordinal: 1, lesson_title_i18n: { pt: 'L3' }, lesson_activity_count: 0 },
    ]);

    expect(out).toEqual({
      program: { id: 'p1', slug: 'dominio-a-agente', title: program.program_title_i18n },
      units: [
        {
          id: 'u1',
          ordinal: 1,
          title: { pt: 'U1' },
          lessons: [
            { id: 'l1', ordinal: 1, title: { pt: 'L1' }, activityCount: 5 },
            { id: 'l2', ordinal: 2, title: { pt: 'L2' }, activityCount: 2 },
          ],
        },
        {
          id: 'u2',
          ordinal: 2,
          title: { pt: 'U2' },
          lessons: [{ id: 'l3', ordinal: 1, title: { pt: 'L3' }, activityCount: 0 }],
        },
      ],
    });
  });

  it('groups by unit id, so two units sharing an ordinal stay apart', () => {
    const out = groupCatalogOutlineRows([
      { ...program, unit_id: 'u1', unit_ordinal: 0, unit_title_i18n: { pt: 'A' },
        lesson_id: 'l1', lesson_ordinal: 0, lesson_title_i18n: {}, lesson_activity_count: 1 },
      { ...program, unit_id: 'u2', unit_ordinal: 0, unit_title_i18n: { pt: 'B' },
        lesson_id: 'l2', lesson_ordinal: 0, lesson_title_i18n: {}, lesson_activity_count: 1 },
    ]);
    expect(out?.units.map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('keeps a unit without lessons as an empty unit', () => {
    const out = groupCatalogOutlineRows([
      { ...program, unit_id: 'u1', unit_ordinal: 1, unit_title_i18n: { pt: 'U1' },
        lesson_id: null, lesson_ordinal: null, lesson_title_i18n: null, lesson_activity_count: null },
    ]);
    expect(out?.units).toEqual([{ id: 'u1', ordinal: 1, title: { pt: 'U1' }, lessons: [] }]);
  });

  it('returns the program with no units when the program has none', () => {
    const out = groupCatalogOutlineRows([
      { ...program, unit_id: null, unit_ordinal: null, unit_title_i18n: null,
        lesson_id: null, lesson_ordinal: null, lesson_title_i18n: null, lesson_activity_count: null },
    ]);
    expect(out).toEqual({
      program: { id: 'p1', slug: 'dominio-a-agente', title: program.program_title_i18n },
      units: [],
    });
  });

  it('returns null for zero rows (unknown, private or archived slug)', () => {
    expect(groupCatalogOutlineRows([])).toBeNull();
    expect(groupCatalogOutlineRows(null)).toBeNull();
  });
});

describe('getCatalogProgramOutline', () => {
  it('calls the catalog_program_outline RPC with the slug', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const out = await getCatalogProgramOutline('dominio-a-agente');
    expect(rpc).toHaveBeenCalledWith('catalog_program_outline', { p_slug: 'dominio-a-agente' });
    expect(out).toBeNull();
  });

  it('throws on RPC error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(getCatalogProgramOutline('x')).rejects.toThrow('boom');
  });
});
