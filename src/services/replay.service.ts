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
 * 👤 GUEST POLICY: **INCLUDE** — and this is the ONLY consumer that does
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tainan, by voice 2026-08-05T16:44Z: *"Sim, convidado gera trace de
 * aprendizagem, mas fica fora da análise — só analytics interna. Então dá pra
 * dar replay, mas não vai pra analytics."*
 *
 * Replay is the "dá pra dar replay" half. Every other reader of
 * `itera.activity_traces` excludes guests, and the set of readers is closed by
 * `src/test/traceEmissionBoundary.test.ts` so a new one has to declare which
 * half it is in. The default there is EXCLUDE; this module is the named
 * exception, and it is safe to be one precisely because it is already
 * admin-only and tenant-scoped — a guest trace can only ever be watched by an
 * admin of the tenant whose class the guest was invited to.
 *
 * Inclusion is DELIBERATE rather than incidental: `watchableLearnerIds` unions
 * the tenant's guests (via `itera.class_guests`) into the scope, because a
 * guest holds no membership and would otherwise be filtered out by accident.
 * And every included guest is FLAGGED (`isGuest`) all the way to the screen —
 * 14 of the 20 guests on record are staff/demo names, so an unmarked guest
 * attempt is a staged observation wearing a measured one's clothes.
 *
 * ⚠️ 🔴 KNOWN GAP, DECLARED RATHER THAN HIDDEN — the DATABASE does not yet
 * allow this read. `traces_select_admin` (migration 0034) scopes through
 * `itera.memberships`, and a guest has none, so an admin's JWT gets ZERO ROWS
 * for a guest trace no matter what this module asks for. The client change here
 * is necessary and not sufficient: guest replay stays empty until migration
 * `0041_activity_traces_guest_admin_read.sql` is applied. That file changes RLS,
 * which means merging it APPLIES IT TO ITERA PRODUCTION, which means it goes in
 * its own PR behind the `db/migrations/**` human gate — it is NOT in this one.
 * The write path and every exclusion below are unaffected and ship now.
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
  /**
   * The learner is a LINK-INVITED GUEST (`itera.class_guests`), not a member of
   * the cohort.
   *
   * ⚠️ SURFACED, NEVER SILENT. Tainan, 2026-08-05: guests generate a trace and
   * *"dá pra dar replay, mas não vai pra analytics"*. Replay is the one surface
   * that includes them, and 14 of the 20 guests on record are staff/demo names
   * — so an admin watching has to be able to tell a sales visitor from a
   * student without recognising the name. Same principle as ADR-4's badge in
   * the class report: listed, and marked.
   */
  isGuest: boolean;
}

/** One attempt for the detail surface, plus who the learner is to this tenant. */
export interface ReplayAttempt extends ReplaySession {
  /** See `ReplayIndexEntry.isGuest`. */
  isGuest: boolean;
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
async function watchableLearnerIds(): Promise<{
  tenantId: string;
  userIds: string[];
  guestIds: Set<string>;
} | null> {
  const memberships = await getMyMemberships();
  const tenantId = adminTenantId(memberships);
  // 🔒 THE GATE. An instructor, an author and a learner all land here, and none
  // of them reaches a query against `activity_traces`.
  if (!tenantId) return null;

  const sb = getSupabase();
  const { data, error } = await sb.from('memberships').select('user_id').eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  const memberIds = (Array.isArray(data) ? data : [])
    .map((row) => (row as Record<string, unknown>).user_id)
    .filter((v): v is string => typeof v === 'string' && v !== '');

  // 👤 THE GUESTS OF THIS TENANT'S CLASSES — and why they need their own lookup.
  //
  // A link-invited guest holds ZERO `itera.memberships` rows: that empty set IS
  // their security boundary (migration 0026, ADR-4). So the membership query
  // above cannot see them, and until 2026-08-05 that did not matter because a
  // guest had no trace to watch. Now they do, and Tainan's answer was *"dá pra
  // dar replay"* — so the scope has to be widened DELIBERATELY rather than the
  // exclusion left standing as an accident of how the scope is computed.
  //
  // 🔒 STILL TENANT-SCOPED, by the same rule and via the same join the class
  // report uses: a guest is watchable exactly when they joined a session
  // belonging to the tenant this caller administers. `class_guests` is readable
  // here because `class_guests_select_instructor` (migration 0026) admits
  // `current_instructor_tenant_ids()`, which includes `tenant_admin`.
  const guestIds = await tenantGuestIds(tenantId);

  return { tenantId, userIds: [...memberIds, ...guestIds], guestIds };
}

/**
 * `itera.users.id` of every guest who joined a session of this tenant.
 *
 * BEST-EFFORT, and that direction is chosen: if this lookup fails the replay
 * falls back to members only, which is the pre-2026-08-05 behaviour. The
 * opposite choice — throwing — would let an unrelated `class_guests` hiccup take
 * down the replay of real learners, and a guest replay is the less valuable of
 * the two by a wide margin.
 *
 * ⚠️ It is resolved LIVE and never denormalised onto the trace row. `is_guest`
 * moves (ADR-7 keeps the guest→account promotion path open), and a flag frozen
 * on a two-week-old trace would answer a question about the promotion rather
 * than about the tenant. Same reason `buildClassReport` resolves `guestUserIds`
 * at report time.
 */
async function tenantGuestIds(tenantId: string): Promise<Set<string>> {
  try {
    const sb = getSupabase();
    const { data: sessions, error: sErr } = await sb
      .from('class_sessions')
      .select('id')
      .eq('tenant_id', tenantId);
    if (sErr) return new Set();
    const sessionIds = (Array.isArray(sessions) ? sessions : [])
      .map((row) => (row as Record<string, unknown>).id)
      .filter((v): v is string => typeof v === 'string' && v !== '');
    if (sessionIds.length === 0) return new Set();

    const { data, error } = await sb
      .from('class_guests')
      .select('user_id')
      .in('session_id', sessionIds);
    if (error) return new Set();
    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => (row as Record<string, unknown>).user_id)
        .filter((v): v is string => typeof v === 'string' && v !== '')
    );
  } catch {
    return new Set();
  }
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
      isGuest: scope.guestIds.has(s.userId),
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
export async function fetchReplaySession(traceId: string): Promise<ReplayAttempt | null> {
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
  if (rows.length === 0) return null;
  const session = readReplaySession(rows[0]);
  if (!session) return null;
  // The badge rides on the DETAIL too, not only the index. An admin who lands
  // on `/admin/replay/<uuid>` from a link never saw the list, and a guest
  // attempt that looks like a cohort attempt on the one screen where it is
  // actually watched is the whole failure ADR-4 names.
  return { ...session, isGuest: scope.guestIds.has(session.userId) };
}

/** The learner's display name from the embedded `users` row, when readable. */
function learnerNameOf(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const users = (row as Record<string, unknown>).users;
  if (!users || typeof users !== 'object' || Array.isArray(users)) return '';
  const name = (users as Record<string, unknown>).display_name;
  return typeof name === 'string' ? name : '';
}
