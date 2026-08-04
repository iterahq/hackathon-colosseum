/**
 * REPLAY data layer — read-only, and ADMIN-ONLY BY CONSTRUCTION.
 *
 * Plan `20260803-itera-replay-de-sessao-de-atividade`, Fase 1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 WHO MAY WATCH — Tainan, TG 2026-08-04, R2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * *"so admin assiste replay de aluno. so do tenant dele tbm."*
 *
 * ⚠️ THAT IS **STRICTER** THAN THE RLS, AND THE GAP IS THE WHOLE POINT OF THIS
 * FILE. `traces_select_instructor` (migration 0034:274-281) gives an INSTRUCTOR
 * of the learner's tenant `select` on `itera.activity_traces`, exactly as
 * `activity_results` has done since 0004. That policy is deliberately NOT being
 * removed: the instructor keeps the ordinary result read they have always had.
 * What the answer to R2 says is that the REPLAY SURFACE — watching the sequence
 * back, action by action — is a different surface with a narrower audience.
 *
 * So the restriction is the surface's own, and it is enforced here, in ONE
 * place, in the order that matters:
 *
 *   1. `adminTenantId()` resolves the caller's tenant_admin/owner membership in
 *      a REAL (non-personal) tenant. NULL ⇒ this module RETURNS WITHOUT EVER
 *      TOUCHING `activity_traces`. An instructor gets null here, and therefore
 *      issues no query at all — not an empty result from a query that ran.
 *   2. every read is then explicitly `.in('user_id', <learners of THAT tenant>)`.
 *
 * Step 2 is not belt-and-braces, it is load-bearing, and this is the subtle
 * part: PostgREST **ORs** the policies. A user who is tenant_admin of A *and*
 * instructor of B passes step 1 on A, and without step 2 the RLS would happily
 * hand back B's learners' traces too. The explicit learner-id filter is what
 * makes "admin **of the learner's tenant**" true rather than merely "an admin,
 * looking at someone".
 *
 * 🔬 PROVEN, NOT ASSERTED: `src/test/replayAdminOnly.test.ts` drives this module
 * with an instructor-only membership set and fails if any query is issued
 * against `activity_traces`; it drives it with a mixed admin-of-A /
 * instructor-of-B set and fails if the query is not scoped to A's learners.
 *
 * ⚠️ AND THE HONEST LIMIT, DECLARED RATHER THAN HIDDEN: this is an APPLICATION
 * gate, not a database one. An instructor who bypasses the app and queries
 * `itera.activity_traces` directly with their own JWT still gets rows, because
 * `traces_select_instructor` still exists — that is unchanged, pre-existing
 * access, not something this feature grants. Closing it at the database needs a
 * migration (a SECURITY DEFINER replay RPC, or a restrictive policy), which
 * merging now applies to the ITERA production database and therefore belongs in
 * its own human-gated PR. It is filed as the follow-up in the PR body rather
 * than quietly conflated with "the surface is admin-only", which is what this
 * file actually delivers.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE MUST NEVER DO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  · NEVER present `itera.activities.spec` AS a capture. The live spec is read
 *    (see the embed below) and may ONLY ever surface as the `inferred` arm of
 *    `ReplayEnunciado`, labelled as today's text — `readEnunciado` in
 *    `replaySession.ts` is the single place that decision is made, and it has no
 *    branch that returns today's spec as `captured`.
 *  · NEVER write the inference back. Nothing here writes `spec_snapshot`; that
 *    column means "what the learner read", and a reconstruction stored in it
 *    would be permanently indistinguishable from a capture.
 *  · NEVER write anything. The trace is append-only (`grant select, insert`
 *    only) and a curator watching must not become learner data. This module
 *    imports nothing from `progress.service` and issues no `insert`/`update`/
 *    `upsert`/`delete`; the test asserts both.
 *  · NEVER use `service_role`. Every query rides the caller's user JWT, per
 *    CLAUDE.md and ADR-2.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { adminTenantId, getMyMemberships } from '@/services/membership.service';
import {
  readReplaySession,
  type ReplayEnunciado,
  type ReplaySession,
} from '@/utils/replaySession';

/** How many attempts the index lists. Newest first; no paging in Fase 1. */
export const REPLAY_PAGE_SIZE = 50;

/**
 * The columns a replay reads. Spelled out rather than `*` because the embed is
 * the load-bearing part: `activities(kind, spec)` pulls the CURRENT activity
 * row, and `spec` there is TODAY's wording, not the learner's.
 *
 * ⚠️ It was `activities(kind)` until 2026-08-04, deliberately, so the surface
 * could not render today's text at all. That absolutism cost more than it
 * bought: 43 of the 45 recorded attempts predate `spec_snapshot`, so every one
 * of them showed an empty "Enunciado não capturado" panel and there was nothing
 * to watch. The column is now read — and the honesty moved from "cannot show it"
 * to "shows it under a different label, in a different visual weight, and never
 * as a capture", which `readEnunciado` enforces in one place and
 * `src/test/replaySession.test.ts` proves.
 *
 * `pedagogical_context` and `spec` are the two widest columns on the row; if
 * this index ever needs paging, drop `spec` from the LIST query first (the list
 * only needs the status, not the text) rather than narrowing the detail read.
 */
const TRACE_COLUMNS =
  'id, user_id, activity_id, schema_version, started_at, actions, actions_truncated, outcome, spec_snapshot, spec_locale, pedagogical_context, created_at, activities(kind, spec), users(display_name)';

export interface ReplayIndexEntry {
  traceId: string;
  userId: string;
  learnerName: string;
  activityId: string;
  kind: string | null;
  startedAt: string | null;
  actionCount: number;
  outcome: string | null;
  /**
   * Which of the THREE enunciado states this attempt lands in — surfaced in the
   * list, not only in the detail, so an admin can see at a glance which
   * attempts are reproducible and which are only approximated.
   *
   * Deliberately the full status and not a boolean: the previous
   * `enunciadoCaptured: boolean` could not tell "today's text, labelled" apart
   * from "nothing at all", and collapsing those two is the whole failure mode
   * this change exists to fix.
   */
  enunciadoStatus: ReplayEnunciado['status'];
}

/**
 * The learner ids this caller may watch: everyone with a membership in the ONE
 * tenant they administer.
 *
 * Returns null — distinct from an empty array — when the caller administers no
 * real tenant. Null means REFUSED and the caller must not query; `[]` means
 * "allowed, but the tenant has no members", which is a different sentence and
 * would be a lie if collapsed into the first.
 */
async function watchableLearnerIds(): Promise<{ tenantId: string; userIds: string[] } | null> {
  const memberships = await getMyMemberships();
  const tenantId = adminTenantId(memberships);
  // 🔒 THE GATE. An instructor, an author and a learner all land here, and none
  // of them reaches a query against `activity_traces`.
  if (!tenantId) return null;

  const sb = getSupabase();
  const { data, error } = await sb.from('memberships').select('user_id').eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  const userIds = (Array.isArray(data) ? data : [])
    .map((row) => (row as Record<string, unknown>).user_id)
    .filter((v): v is string => typeof v === 'string' && v !== '');
  return { tenantId, userIds };
}

/** The attempts this admin may watch, newest first. Empty when refused. */
export async function listReplaySessions(limit = REPLAY_PAGE_SIZE): Promise<ReplayIndexEntry[]> {
  if (!isSupabaseConfigured) return [];
  const scope = await watchableLearnerIds();
  if (!scope || scope.userIds.length === 0) return [];

  const sb = getSupabase();
  const { data, error } = await sb
    .from('activity_traces')
    .select(TRACE_COLUMNS)
    .in('user_id', scope.userIds)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(readReplaySession)
    .filter((s): s is ReplaySession => s !== null)
    .map((s, i) => ({
      traceId: s.traceId,
      userId: s.userId,
      learnerName: learnerNameOf(rows[i]),
      activityId: s.activityId,
      kind: s.kind,
      startedAt: s.startedAt,
      actionCount: s.actions.length,
      outcome: s.outcome,
      enunciadoStatus: s.enunciado.status,
    }));
}

/**
 * ONE attempt, by trace id.
 *
 * The `.in('user_id', …)` is repeated here rather than trusted from the index,
 * because this is a directly-addressable URL: `/admin/replay/<uuid>` typed by
 * hand must be refused by the same rule that filters the list. Returns null for
 * "not yours" and for "does not exist" alike — a surface that distinguished the
 * two would confirm the existence of another tenant's row.
 */
export async function fetchReplaySession(traceId: string): Promise<ReplaySession | null> {
  if (!isSupabaseConfigured || !traceId) return null;
  const scope = await watchableLearnerIds();
  if (!scope || scope.userIds.length === 0) return null;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('activity_traces')
    .select(TRACE_COLUMNS)
    .eq('id', traceId)
    .in('user_id', scope.userIds)
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.length > 0 ? readReplaySession(rows[0]) : null;
}

/** The learner's display name from the embedded `users` row, when readable. */
function learnerNameOf(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const users = (row as Record<string, unknown>).users;
  if (!users || typeof users !== 'object' || Array.isArray(users)) return '';
  const name = (users as Record<string, unknown>).display_name;
  return typeof name === 'string' ? name : '';
}
