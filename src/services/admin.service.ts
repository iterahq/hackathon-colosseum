/**
 * Tenant-admin observability data layer (plan #6 — BASIC v1).
 *
 * READ-ONLY. Every query runs as the signed-in tenant_admin's user JWT
 * (RLS-scoped) — NEVER service_role (ADR-2). RLS is the authority for tenant
 * isolation; we ALSO scope by the admin's tenantId explicitly via the
 * membership set (belt + suspenders).
 *
 * Signals present in the live Itera schema (ADR-8 / read-only audit):
 *   - completion: per-program completed/total ACTIVITY ratio
 *     (progress.status='completed' OR activity_results.passed=true).
 *   - engagement: completion COUNT + last-active RECENCY only.
 * No raw scores are surfaced (score_internal is never read here) — ADR-5/ADR-15.
 *
 * Tenant scoping (ADR-6): tenant_id lives ONLY on memberships/programs, NOT on
 * activity_results/progress. So the admin's learner set = memberships in the
 * tenant; results/progress are filtered by that learner-id set.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { I18nText } from '@/types/content';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bag = (v: unknown): I18nText =>
  v && typeof v === 'object' ? (v as I18nText) : {};

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — Itera admin data unavailable.');
  }
  return getSupabase();
}

export interface AdminLearner {
  userId: string;
  name: string;
  email: string;
  activitiesDone: number;
  activitiesTotal: number;
  completionPct: number;
  lastActive: string | null;
}

export interface ProgramCompletion {
  programId: string;
  slug: string;
  title: I18nText;
  activitiesTotal: number;
  enrolled: number;
  active: number; // learners with ≥1 completion
  completedActivityInstances: number; // sum of completions across learners
  completionPct: number; // completed / (enrolled * activitiesTotal)
}

export interface EngagementPoint {
  userId: string;
  name: string;
  completions: number;
  lastActive: string | null;
}

/* ── Internal helpers ─────────────────────────────────────────────────── */

/** The tenant's learner ids + their user rows (RLS already scopes to tenant). */
async function tenantLearners(tenantId: string) {
  const sb = client();
  // memberships in this tenant (RLS: admin sees its tenant's memberships)
  const { data: mem, error: memErr } = await sb
    .from('memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId); // explicit app-layer filter (belt + suspenders)
  if (memErr) throw new Error(memErr.message);

  const memberRows = asRows(mem);
  const userIds = memberRows.map((m) => str(m.user_id));
  if (userIds.length === 0) return { users: [] as Row[], userIds };

  const { data: users, error: uErr } = await sb
    .from('users')
    .select('id, display_name, email')
    .in('id', userIds);
  if (uErr) throw new Error(uErr.message);

  // Only learners (exclude admins/authors from the roster of "learners").
  const learnerIds = new Set(
    memberRows.filter((m) => str(m.role) === 'learner').map((m) => str(m.user_id))
  );
  const learnerUsers = asRows(users).filter((u) => learnerIds.has(str(u.id)));
  return { users: learnerUsers, userIds: Array.from(learnerIds) };
}

/** Completion signal per (user, activity): completed when passed OR status completed. */
async function resultsFor(userIds: string[]) {
  if (userIds.length === 0) return { results: [] as Row[], progress: [] as Row[] };
  const sb = client();
  const [{ data: results, error: rErr }, { data: progress, error: pErr }] =
    await Promise.all([
      sb.from('activity_results').select('user_id, activity_id, passed, created_at').in('user_id', userIds),
      sb.from('progress').select('user_id, activity_id, status, completed_at').in('user_id', userIds),
    ]);
  if (rErr) throw new Error(rErr.message);
  if (pErr) throw new Error(pErr.message);
  return { results: asRows(results), progress: asRows(progress) };
}

/** Activity ids that belong to a tenant's programs (for the completion denominator). */
async function tenantActivityIds(tenantId: string): Promise<string[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select('id, units:units ( lessons:lessons ( activities:activities ( id ) ) )')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  const ids: string[] = [];
  for (const p of asRows(data)) {
    for (const u of asRows(p.units)) {
      for (const l of asRows(u.lessons)) {
        for (const a of asRows(l.activities)) ids.push(str(a.id));
      }
    }
  }
  return ids;
}

/** Set of (user_id|activity_id) the learner has completed. */
function completedPairs(results: Row[], progress: Row[]): Set<string> {
  const done = new Set<string>();
  for (const r of results) {
    if (r.passed === true) done.add(`${str(r.user_id)}|${str(r.activity_id)}`);
  }
  for (const p of progress) {
    if (str(p.status) === 'completed') done.add(`${str(p.user_id)}|${str(p.activity_id)}`);
  }
  return done;
}

function lastActiveFor(userId: string, results: Row[], progress: Row[]): string | null {
  let latest: string | null = null;
  const consider = (ts: unknown) => {
    const s = str(ts);
    if (s && (!latest || s > latest)) latest = s;
  };
  for (const r of results) if (str(r.user_id) === userId) consider(r.created_at);
  for (const p of progress) if (str(p.user_id) === userId) consider(p.completed_at);
  return latest;
}

/* ── Public queries ───────────────────────────────────────────────────── */

/** Roster: learners in the tenant + completion% over the tenant's activities. */
export async function getAdminRoster(tenantId: string): Promise<AdminLearner[]> {
  const { users, userIds } = await tenantLearners(tenantId);
  const activityIds = await tenantActivityIds(tenantId);
  const total = activityIds.length;
  const { results, progress } = await resultsFor(userIds);
  const done = completedPairs(results, progress);
  const activitySet = new Set(activityIds);

  return users
    .map((u) => {
      const uid = str(u.id);
      let doneCount = 0;
      for (const aid of activityIds) if (done.has(`${uid}|${aid}`)) doneCount++;
      // also count completions on activities outside the program tree (defensive)
      void activitySet;
      const completionPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      return {
        userId: uid,
        name: str(u.display_name) || str(u.email) || uid.slice(0, 8),
        email: str(u.email),
        activitiesDone: doneCount,
        activitiesTotal: total,
        completionPct,
        lastActive: lastActiveFor(uid, results, progress),
      } satisfies AdminLearner;
    })
    .sort((a, b) => b.completionPct - a.completionPct);
}

/** Completion per program: enrolled learners, active learners, completion ratio. */
export async function getAdminCompletion(tenantId: string): Promise<ProgramCompletion[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select('id, slug, title_i18n, units:units ( lessons:lessons ( activities:activities ( id ) ) )')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  const { userIds } = await tenantLearners(tenantId);
  const { results, progress } = await resultsFor(userIds);
  const done = completedPairs(results, progress);

  return asRows(data).map((p) => {
    const activityIds: string[] = [];
    for (const u of asRows(p.units))
      for (const l of asRows(u.lessons))
        for (const a of asRows(l.activities)) activityIds.push(str(a.id));
    const activitiesTotal = activityIds.length;
    const enrolled = userIds.length;

    let completedInstances = 0;
    const activeLearners = new Set<string>();
    for (const uid of userIds) {
      for (const aid of activityIds) {
        if (done.has(`${uid}|${aid}`)) {
          completedInstances++;
          activeLearners.add(uid);
        }
      }
    }
    const denom = enrolled * activitiesTotal;
    const completionPct = denom > 0 ? Math.round((completedInstances / denom) * 100) : 0;

    return {
      programId: str(p.id),
      slug: str(p.slug),
      title: bag(p.title_i18n),
      activitiesTotal,
      enrolled,
      active: activeLearners.size,
      completedActivityInstances: completedInstances,
      completionPct,
    } satisfies ProgramCompletion;
  });
}

/** Engagement: per-learner completion count + last-active recency (ADR-4/ADR-8). */
export async function getAdminEngagement(tenantId: string): Promise<EngagementPoint[]> {
  const { users, userIds } = await tenantLearners(tenantId);
  const { results, progress } = await resultsFor(userIds);
  const done = completedPairs(results, progress);

  // completion count per user (distinct completed activities)
  const countByUser = new Map<string, number>();
  for (const key of done) {
    const uid = key.split('|')[0];
    countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1);
  }

  return users
    .map((u) => {
      const uid = str(u.id);
      return {
        userId: uid,
        name: str(u.display_name) || str(u.email) || uid.slice(0, 8),
        completions: countByUser.get(uid) ?? 0,
        lastActive: lastActiveFor(uid, results, progress),
      } satisfies EngagementPoint;
    })
    .sort((a, b) => b.completions - a.completions);
}
