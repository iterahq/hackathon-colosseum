import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * catalog.service — browse + enroll via the SECURITY DEFINER RPCs
 * (itera.catalog_programs / itera.enroll_in_program). The Supabase client is
 * mocked; we assert the RPC name/args and the row→DTO mapping.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ rpc }),
}));

import { getCatalogPrograms, enrollInProgram } from '@/services/catalog.service';

beforeEach(() => rpc.mockReset());

describe('getCatalogPrograms', () => {
  it('calls the catalog_programs RPC and maps rows to CatalogProgram', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'p1',
          tenant_id: 't-itera',
          tenant_slug: 'itera',
          slug: 'modele-dados-com-ia',
          title_i18n: { pt: 'Modele', en: 'Model' },
          created_at: '2026-06-01T00:00:00Z',
          unit_count: 1,
          lesson_count: 2,
          activity_count: 8,
          already_enrolled: false,
        },
      ],
      error: null,
    });

    const out = await getCatalogPrograms();
    expect(rpc).toHaveBeenCalledWith('catalog_programs');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'p1',
      tenantSlug: 'itera',
      slug: 'modele-dados-com-ia',
      activityCount: 8,
      alreadyEnrolled: false,
    });
    expect(out[0].title.pt).toBe('Modele');
    expect(out[0].accent).toBeTruthy();
  });

  it('throws on RPC error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(getCatalogPrograms()).rejects.toThrow('boom');
  });
});

describe('enrollInProgram', () => {
  it('calls enroll_in_program with the program id and returns the result', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ out_tenant_id: 't-itera', out_role: 'learner', out_enrolled: true }],
      error: null,
    });
    const res = await enrollInProgram('p1');
    expect(rpc).toHaveBeenCalledWith('enroll_in_program', { p_program_id: 'p1' });
    expect(res).toEqual({ tenantId: 't-itera', role: 'learner', enrolled: true });
  });

  it('is idempotent — already-enrolled returns enrolled:false', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ out_tenant_id: 't-itera', out_role: 'learner', out_enrolled: false }],
      error: null,
    });
    const res = await enrollInProgram('p1');
    expect(res.enrolled).toBe(false);
  });

  it('throws on RPC error (e.g. not in catalog)', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'program is not in the self-serve catalog' },
    });
    await expect(enrollInProgram('p-private')).rejects.toThrow('not in the self-serve catalog');
  });
});
