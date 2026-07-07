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
import type { ClassCompleter } from '@/types/liveClass';

export type { ClassCompleter } from '@/types/liveClass';

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
 * The set of the user's tenant ids that have live_class_enabled=true. Feeds the
 * DETERMINISTIC instructor-tenant resolver (membership.service.instructorTenantId)
 * so a real instructor targets the enabled teaching tenant (e.g. dfl-batch), never
 * their PLG-auto-created personal `owner` tenant (enabled=false). (loop-1 fix #4.)
 */
export async function getEnabledTenantIds(): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const { data: mem, error: memErr } = await sb.from('memberships').select('tenant_id');
  if (memErr) return [];
  const tenantIds = asRows(mem).map((m) => str(m.tenant_id)).filter(Boolean);
  if (tenantIds.length === 0) return [];

  const { data: tenants, error: tErr } = await sb
    .from('tenants')
    .select('id, live_class_enabled')
    .in('id', tenantIds);
  if (tErr) return [];
  return asRows(tenants)
    .filter((t) => t.live_class_enabled === true)
    .map((t) => str(t.id))
    .filter(Boolean);
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
 * The lesson's FIRST activity id by ordinal (lowest ordinal, id tie-break), or
 * null when the lesson has no activities. Server-side belt for the start-race:
 * if the caller couldn't resolve the first activity (useLessonContent hadn't
 * resolved when Start was clicked), we still default the pointer here so a
 * started session is never stuck on a null pointer. (loop-1 fix #1b.)
 */
export async function getFirstActivityId(lessonId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !lessonId) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('activities')
    .select('id, ordinal')
    .eq('lesson_id', lessonId)
    .order('ordinal', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (error) return null;
  const first = asRows(data)[0];
  return first ? strOrNull(first.id) : null;
}

/**
 * Start a live session in RECEPTION: insert as `live` with a NULL pointer so
 * students land on a reception/lobby screen instead of jumping straight into the
 * first activity. The instructor leaves reception by advancing to the first
 * activity ("Começar aula"). The null pointer is the intended pre-start state
 * here — it supersedes the loop-1 fix #1 that auto-defaulted the pointer.
 */
export async function startClassSession(params: {
  tenantId: string;
  lessonId: string;
  instructorId: string;
  scope?: ClassScope;
}): Promise<ClassSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('class_sessions')
    .insert({
      tenant_id: params.tenantId,
      lesson_id: params.lessonId,
      instructor_id: params.instructorId,
      current_activity_id: null,
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

/**
 * For a tenant + activity, the learners flagged done on THAT activity.
 * Reads memberships/users/progress/activity_results under the instructor READ
 * policies (migration 0013). Completion = progress.status='completed' OR
 * activity_results.passed. Mirrors admin.service's completion signal.
 *
 * PRESENCE-SCOPED (loop-1 fix #2): when `presentUserIds` is provided (the live
 * presence roster — students actually in the session), the roster + denominator
 * are restricted to those learners. This stops the instructor view from (a)
 * counting the WHOLE tenant cohort as the denominator (e.g. "2/6" when only 3
 * joined) and (b) LEAKING the names of absent learners into the live view. When
 * omitted (no roster yet), it falls back to the full tenant learner set.
 */
export async function getClassActivityCompleters(
  tenantId: string,
  activityId: string,
  presentUserIds?: string[],
  since?: string
): Promise<ClassCompleter[]> {
  if (!isSupabaseConfigured || !activityId) return [];
  const sb = getSupabase();

  const presentSet =
    presentUserIds && presentUserIds.length > 0 ? new Set(presentUserIds) : null;

  const { data: mem } = await sb
    .from('memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId);
  const learnerIds = asRows(mem)
    .filter((m) => str(m.role) === 'learner')
    .map((m) => str(m.user_id))
    .filter(Boolean)
    // Scope to who's actually in the room (present-first), so the denominator
    // and the shown names never include absent learners.
    .filter((id) => (presentSet ? presentSet.has(id) : true));
  if (learnerIds.length === 0) return [];

  const { data: users } = await sb
    .from('users')
    .select('id, display_name, email')
    .in('id', learnerIds);

  // `since` = the session's started_at, so a new class of the same lesson starts
  // fresh instead of inheriting prior completions of the same activity.
  const progressBase = sb
    .from('progress')
    .select('user_id, status')
    .eq('activity_id', activityId)
    .in('user_id', learnerIds);
  const resultsBase = sb
    .from('activity_results')
    .select('user_id, passed')
    .eq('activity_id', activityId)
    .in('user_id', learnerIds);

  const [{ data: progress }, { data: results }] = await Promise.all([
    since ? progressBase.gte('completed_at', since) : progressBase,
    since ? resultsBase.gte('created_at', since) : resultsBase,
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
