import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The instructor-side guest link (plan 20260728-…, ADR-12).
 *
 * The behaviour that matters is the CAPABILITY PROBE. `class_sessions.guest_code`
 * and `itera.class_guests` land in migration 0026, and the Itera project has no
 * migration ledger — merging the migration PR applies nothing, a human runs the
 * script afterwards. So this UI can legitimately be deployed before the DDL
 * exists, and every read here must degrade to "not available" instead of
 * surfacing a button that 400s (or, worse, breaking the session read that the
 * whole live class depends on).
 */

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  updateMaybeSingle: vi.fn(),
  update: vi.fn(),
  guestsResult: { data: [] as unknown, error: null as unknown },
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => {
      if (table === 'class_guests') {
        return { select: () => ({ eq: () => Promise.resolve(mocks.guestsResult) }) };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
        update: (patch: unknown) => {
          mocks.update(patch);
          return { eq: () => ({ select: () => ({ maybeSingle: mocks.updateMaybeSingle }) }) };
        },
      };
    },
  }),
}));

import {
  ensureSessionGuestCode,
  getSessionGuestCode,
  listSessionGuestUserIds,
} from '@/services/guestLink.service';
import { GUEST_CODE_ALPHABET } from '@/utils/guestCode';

describe('getSessionGuestCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the existing code', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { guest_code: 'ABCD2345' }, error: null });
    expect(await getSessionGuestCode('s1')).toEqual({ code: 'ABCD2345', available: true });
  });

  it('reports available-with-no-code for a session nobody has shared yet', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { guest_code: null }, error: null });
    expect(await getSessionGuestCode('s1')).toEqual({ code: null, available: true });
  });

  it('reports UNAVAILABLE when the column is not there (migration 0026 not applied)', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'column class_sessions.guest_code does not exist' },
    });
    expect(await getSessionGuestCode('s1')).toEqual({ code: null, available: false });
  });
});

describe('ensureSessionGuestCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT rotate a code the professor may already have pasted somewhere', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { guest_code: 'ABCD2345' }, error: null });
    const state = await ensureSessionGuestCode('s1');
    expect(state.code).toBe('ABCD2345');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('generates one on first use, from the unambiguous alphabet', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { guest_code: null }, error: null });
    mocks.updateMaybeSingle.mockResolvedValue({ data: { guest_code: 'MNPQ6789' }, error: null });

    const state = await ensureSessionGuestCode('s1');
    expect(state).toEqual({ code: 'MNPQ6789', available: true });

    const patch = mocks.update.mock.calls[0][0] as { guest_code: string };
    expect(patch.guest_code).toHaveLength(8);
    for (const ch of patch.guest_code) expect(GUEST_CODE_ALPHABET).toContain(ch);
  });

  it('never attempts the UPDATE when the schema is not there', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await ensureSessionGuestCode('s1')).toEqual({ code: null, available: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('degrades when RLS refuses the write (non-staff caller)', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { guest_code: null }, error: null });
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await ensureSessionGuestCode('s1')).toEqual({ code: null, available: false });
  });
});

describe('listSessionGuestUserIds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the durable guest ids for the badge + counter', async () => {
    mocks.guestsResult = { data: [{ user_id: 'g1' }, { user_id: 'g2' }], error: null };
    expect(await listSessionGuestUserIds('s1')).toEqual(['g1', 'g2']);
  });

  it('returns [] rather than throwing when class_guests does not exist yet', async () => {
    mocks.guestsResult = { data: null, error: { message: 'relation does not exist' } };
    expect(await listSessionGuestUserIds('s1')).toEqual([]);
  });
});
