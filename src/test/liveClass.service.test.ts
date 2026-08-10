import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Live-class service logic (plan 20260702-…):
 *  - the per-tenant ENABLE GATE (isLiveClassEnabledForUser): true only when the
 *    user is a member of a tenant with live_class_enabled=true.
 *  - getActiveLiveClass returns the live session ONLY when enabled, else null.
 *  - mapSession field mapping (snake_case row → camelCase ClassSession).
 *
 * Supabase is mocked with a tiny in-memory PostgREST-ish builder (mirrors the
 * admin.service.test fixture style).
 */

const ENABLED_TENANT = 'tenant-dfl';
const DISABLED_TENANT = 'tenant-x';

let membershipTenant = ENABLED_TENANT; // switched per-test

const liveRow = {
  id: 'sess-1',
  tenant_id: ENABLED_TENANT,
  lesson_id: 'lesson-1',
  instructor_id: 'itera-instr',
  current_activity_id: 'act-1',
  status: 'live',
  scope: 'global',
  podium_every: 3,
  started_at: '2026-07-02T10:00:00Z',
  ended_at: null,
  created_at: '2026-07-02T09:59:00Z',
};

function makeQuery(table: string) {
  let rows: Record<string, unknown>[] = [];
  if (table === 'memberships') rows = [{ tenant_id: membershipTenant }];
  if (table === 'tenants')
    rows = [
      { id: ENABLED_TENANT, live_class_enabled: true },
      { id: DISABLED_TENANT, live_class_enabled: false },
    ];
  if (table === 'class_sessions') rows = [{ ...liveRow }];

  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      rows = rows.filter((r) => vals.includes(r[col]));
      return builder;
    },
    order() {
      return builder;
    },
    limit(n: number) {
      rows = rows.slice(0, n);
      return Promise.resolve({ data: rows, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (table: string) => makeQuery(table) }),
}));

import {
  isLiveClassEnabledForUser,
  getActiveLiveClass,
  mapSession,
} from '@/services/liveClass.service';

beforeEach(() => {
  membershipTenant = ENABLED_TENANT;
});

describe('live-class enable gate', () => {
  it('is enabled when the user belongs to a tenant with live_class_enabled=true', async () => {
    membershipTenant = ENABLED_TENANT;
    expect(await isLiveClassEnabledForUser()).toBe(true);
  });

  it('is disabled when the user only belongs to a non-enabled tenant', async () => {
    membershipTenant = DISABLED_TENANT;
    expect(await isLiveClassEnabledForUser()).toBe(false);
  });
});

describe('getActiveLiveClass', () => {
  it('returns the live session when the feature is enabled for the user', async () => {
    membershipTenant = ENABLED_TENANT;
    const s = await getActiveLiveClass();
    expect(s).not.toBeNull();
    expect(s?.id).toBe('sess-1');
    expect(s?.currentActivityId).toBe('act-1');
    expect(s?.status).toBe('live');
    expect(s?.scope).toBe('global');
  });

  it('returns null (badge hidden) when the feature is disabled for the tenant', async () => {
    membershipTenant = DISABLED_TENANT;
    expect(await getActiveLiveClass()).toBeNull();
  });
});

describe('mapSession', () => {
  it('maps snake_case row fields to the camelCase ClassSession shape', () => {
    const s = mapSession(liveRow);
    expect(s).toEqual({
      id: 'sess-1',
      tenantId: ENABLED_TENANT,
      lessonId: 'lesson-1',
      instructorId: 'itera-instr',
      currentActivityId: 'act-1',
      status: 'live',
      scope: 'global',
      podiumEvery: 3,
      timerGated: false,
      scheduledAt: null,
      startedAt: '2026-07-02T10:00:00Z',
      endedAt: null,
      createdAt: '2026-07-02T09:59:00Z',
    });
  });

  it('maps a scheduled_at timestamp to scheduledAt', () => {
    expect(mapSession({ ...liveRow, scheduled_at: '2026-08-15T18:30:00Z' }).scheduledAt).toBe(
      '2026-08-15T18:30:00Z'
    );
  });

  it('coerces a null current_activity_id to null', () => {
    expect(mapSession({ ...liveRow, current_activity_id: null }).currentActivityId).toBeNull();
  });

  it('coerces an absent/invalid podium_every to null', () => {
    expect(mapSession({ ...liveRow, podium_every: null }).podiumEvery).toBeNull();
    expect(mapSession({ ...liveRow, podium_every: 0 }).podiumEvery).toBeNull();
  });

  it('só lê timerGated como ligado no `true` explícito', () => {
    // Uma linha de um schema sem a coluna (0057 não aplicada, backup antigo) tem
    // que ler como aula SEM trava. O erro contrário deixaria a turma inteira
    // impedida de responder sem ninguém ter pedido isso.
    expect(mapSession({ ...liveRow, timer_gated: true }).timerGated).toBe(true);
    expect(mapSession({ ...liveRow, timer_gated: 'true' }).timerGated).toBe(false);
    expect(mapSession(liveRow).timerGated).toBe(false);
  });
});
