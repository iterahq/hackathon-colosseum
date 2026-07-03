/**
 * Live-class / real-time cohort mode data layer (plan
 * 20260702-iterahq-live-class-dogfood-sync-layer).
 *
 * Reads/writes itera.class_sessions via the signed-in user's JWT (RLS-scoped).
 * The session row is the DURABLE / reconnect truth for a live class; the
 * broadcast fast-path (useClassSession) rides on top. The professor advances the
 * server-authoritative `current_activity_id`; students force-advance to it.
 *
 * The whole feature is GATED per-tenant: `isLiveClassEnabledForUser()` returns
 * false unless the user is a member of a tenant with `live_class_enabled=true`
 * (only the DevFellowship 'dfl-batch' tenant is enabled in v1). When disabled,
 * the badge / active-class resolver / professor surface are inert.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export type ClassSessionStatus = 'pending' | 'live' | 'ended';
export type ClassScope = 'global' | 'tenant';

export interface ClassSession {
  id: string;
  tenantId: string;
  lessonId: string;
  instructorId: string;
  currentActivityId: string | null;
  status: ClassSessionStatus;
  scope: ClassScope;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const SELECT_COLS =
  'id, tenant_id, lesson_id, instructor_id, current_activity_id, status, scope, started_at, ended_at, created_at';

export function mapSession(row: Row): ClassSession {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    lessonId: str(row.lesson_id),
    instructorId: str(row.instructor_id),
    currentActivityId: strOrNull(row.current_activity_id),
    status: (str(row.status) || 'pending') as ClassSessionStatus,
    scope: (str(row.scope) || 'global') as ClassScope,
    startedAt: strOrNull(row.started_at),
    endedAt: strOrNull(row.ended_at),
    createdAt: str(row.created_at),
  };
}

/**
 * True when the signed-in user belongs to at least one tenant with the live-class
 * feature enabled. `itera.tenants` is public-read, so this is a cheap join:
 * memberships (own rows, RLS) → tenants.live_class_enabled.
 */
export async function isLiveClassEnabledForUser(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const sb = getSupabase();
  const { data: mem, error: memErr } = await sb.from('memberships').select('tenant_id');
  if (memErr) return false;
  const tenantIds = asRows(mem).map((m) => str(m.tenant_id)).filter(Boolean);
  if (tenantIds.length === 0) return false;

  const { data: tenants, error: tErr } = await sb
    .from('tenants')
    .select('id, live_class_enabled')
    .in('id', tenantIds);
  if (tErr) return false;
  return asRows(tenants).some((t) => t.live_class_enabled === true);
}

/**
 * The active LIVE session visible to the current user (global + tenant-scoped via
 * RLS), or null. Returns null when the feature is disabled for the user's tenant
 * (the enable gate) — so the badge never shows for a non-enabled tenant.
 */
export async function getActiveLiveClass(): Promise<ClassSession | null> {
  if (!isSupabaseConfigured) return null;
  if (!(await isLiveClassEnabledForUser())) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .select(SELECT_COLS)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return mapSession(data[0] as Row);
}

/** Read a single session by id (RLS-scoped). Null when not visible / not found. */
export async function getClassSession(sessionId: string): Promise<ClassSession | null> {
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .select(SELECT_COLS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return mapSession(data as Row);
}

/**
 * The instructor's OWN sessions in a tenant (any status), newest first. Powers
 * the professor surface "resume / current session" lookup.
 */
export async function getMySessions(tenantId: string): Promise<ClassSession[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .select(SELECT_COLS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return asRows(data).map((r) => mapSession(r));
}

/**
 * Start a live session: insert as `live` pointing at `firstActivityId` (or null).
 * scope defaults to 'global' for v1. Returns the created session.
 */
export async function startClassSession(params: {
  tenantId: string;
  lessonId: string;
  instructorId: string;
  firstActivityId?: string | null;
  scope?: ClassScope;
}): Promise<ClassSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .insert({
      tenant_id: params.tenantId,
      lesson_id: params.lessonId,
      instructor_id: params.instructorId,
      current_activity_id: params.firstActivityId ?? null,
      status: 'live',
      scope: params.scope ?? 'global',
      started_at: new Date().toISOString(),
    })
    .select(SELECT_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not start the class session.');
  return mapSession(data as Row);
}

/** Move the server-authoritative pointer to a new activity (durable path). */
export async function advanceClassSession(
  sessionId: string,
  activityId: string
): Promise<ClassSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .update({ current_activity_id: activityId })
    .eq('id', sessionId)
    .select(SELECT_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not advance the class.');
  return mapSession(data as Row);
}

/** End the session (status='ended'). Never deletes — keeps the audit trail. */
export async function endClassSession(sessionId: string): Promise<ClassSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(SELECT_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not end the class.');
  return mapSession(data as Row);
}

/* ── "Who's done on the current activity" (instructor view) ───────────────── */

export interface ClassCompleter {
  userId: string;
  name: string;
  done: boolean;
}

/**
 * For a tenant + activity, the tenant's learners flagged done on THAT activity.
 * Reads memberships/users/progress/activity_results under the instructor READ
 * policies (migration 0013). Completion = progress.status='completed' OR
 * activity_results.passed. Mirrors admin.service's completion signal.
 */
export async function getClassActivityCompleters(
  tenantId: string,
  activityId: string
): Promise<ClassCompleter[]> {
  if (!isSupabaseConfigured || !activityId) return [];
  const sb = getSupabase();

  const { data: mem } = await sb
    .from('memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId);
  const learnerIds = asRows(mem)
    .filter((m) => str(m.role) === 'learner')
    .map((m) => str(m.user_id))
    .filter(Boolean);
  if (learnerIds.length === 0) return [];

  const { data: users } = await sb
    .from('users')
    .select('id, display_name, email')
    .in('id', learnerIds);

  const [{ data: progress }, { data: results }] = await Promise.all([
    sb
      .from('progress')
      .select('user_id, status')
      .eq('activity_id', activityId)
      .in('user_id', learnerIds),
    sb
      .from('activity_results')
      .select('user_id, passed')
      .eq('activity_id', activityId)
      .in('user_id', learnerIds),
  ]);

  const doneIds = new Set<string>();
  for (const p of asRows(progress)) if (str(p.status) === 'completed') doneIds.add(str(p.user_id));
  for (const r of asRows(results)) if (r.passed === true) doneIds.add(str(r.user_id));

  return asRows(users)
    .map((u) => {
      const uid = str(u.id);
      return {
        userId: uid,
        name: str(u.display_name) || str(u.email) || uid.slice(0, 8),
        done: doneIds.has(uid),
      } satisfies ClassCompleter;
    })
    .sort((a, b) => Number(b.done) - Number(a.done) || a.name.localeCompare(b.name));
}
