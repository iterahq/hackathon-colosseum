import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A class session used to be created with scope='global'. The realtime policy
 * (migration 0022) opens `class:<id>` to ANY authenticated user while a global
 * session is live, so every Itera account could join the Educar+ room. The
 * audience is the tenant; creation must default to it.
 */

const inserted: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          return Promise.resolve({ data: { ...inserted[inserted.length - 1] }, error: null });
        },
      };
      return builder;
    },
  }),
}));

const { scheduleClassSession, startClassSession } = await import('@/services/liveClass.service');

const base = { tenantId: 'tenant-educar', lessonId: 'lesson-1', instructorId: 'instr-1' };

beforeEach(() => {
  inserted.length = 0;
});

describe('class session creation scope', () => {
  it('starts a class tenant-scoped by default', async () => {
    await startClassSession({ ...base });
    expect(inserted[0].scope).toBe('tenant');
  });

  it('schedules a class tenant-scoped by default', async () => {
    await scheduleClassSession({ ...base, scheduledAt: '2026-08-15T18:30:00Z' });
    expect(inserted[0].scope).toBe('tenant');
  });

  it('still honours an explicit scope', async () => {
    await startClassSession({ ...base, scope: 'global' });
    expect(inserted[0].scope).toBe('global');
  });

  it('falls back to tenant when a row carries no scope', async () => {
    const { mapSession } = await import('@/services/liveClass.service');
    expect(mapSession({ id: 's1' }).scope).toBe('tenant');
  });
});
