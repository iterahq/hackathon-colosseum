/**
 * Itera content data layer — reads the real `itera.*` schema via the Supabase
 * anon/authed client (RLS-scoped per tenant via JWT claims, ADR-103).
 *
 * Padrão do projeto (horizontal): componente → hook de query → service → fetch.
 * Sem React aqui. "Recurso não existe" = throw → React Query vira isError.
 *
 * When Supabase is not configured (CI build with no VITE_* / local mock), each
 * function throws a clear error; the query hooks surface isError and the pages
 * render a clean empty/error state.
 */
import { HOME_PROGRAMS_SELECT, HOME_XP_SELECT, homeBadgesOf, homeProgramsOf, homeStatsOf } from '@iterahq/shell-core';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import { normalizeProgressStatus } from '@/utils/normalizeProgressStatus';
import { isScenarioKind } from '@/utils/activityFamilies';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import type {
  Activity,
  Badge,
  Program,
  ProgramDetail,
  ProgressStatus,
  TenantLesson,
  Unit,
  UserStats,
} from '@/types/content';

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  return getSupabase();
}

/**
 * The program slug resolved to NOTHING — the row does not exist, or it exists
 * and this user is NOT enrolled in its tenant, so RLS hides it. PostgREST
 * answers both cases identically (an empty result, HTTP 200, no error), so the
 * client genuinely CANNOT tell them apart. The UI must therefore say both.
 *
 * The distinction that DOES matter is permanent-vs-transient: retrying can
 * never fix either case, so this error must be separable from a transport
 * failure. Same shape, same reason, same guard style as
 * `ActivityNotFoundError` in `authorCanvas.service.ts` — see that file for the
 * precedent (E2E 2026-07-28, D5).
 */
export class ProgramNotFoundError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Program not found or not accessible: ${slug}`);
    this.name = 'ProgramNotFoundError';
    this.slug = slug;
  }
}

/**
 * Type guard for the above. Compares `name` rather than using `instanceof` so it
 * survives duplicated module instances / transpiled subclassing.
 */
export function isProgramNotFoundError(e: unknown): e is ProgramNotFoundError {
  return e instanceof Error && e.name === 'ProgramNotFoundError';
}

/** Evergreen-family accents so each program card gets a stable colored glow. */

/* ── Raw Supabase row shapes (PostgREST nested selects return loose JSON) ── */
type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
/**
 * A PostgREST to-ONE embed arrives as an object OR as a 1-element array,
 * depending on how the relationship is inferred. `asRows` deliberately returns
 * [] for the object form (it guards to-MANY embeds), so to-one needs its own
 * normaliser — using the wrong one silently yields `null` ancestors.
 */
const asRow = (v: unknown): Row | undefined => {
  if (Array.isArray(v)) return v[0] as Row | undefined;
  return v && typeof v === 'object' ? (v as Row) : undefined;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const bag = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

/**
 * List all programs the current user/tenant can see, with derived counts.
 * RLS scopes the rows to the user's tenant; anonymous sessions see public rows
 * only (per the schema's policies).
 *
 * `archived_at` has existed on the table since the first migration and NOTHING
 * read it — so retiring a program was impossible and the tenant accumulated
 * duplicates, dead pilots and a literal `[TESTE] … apagar` sitting in front of
 * 37 Educar+ learners. Filtering here (and not on the detail read below) is the
 * whole point: an archived program stops being OFFERED, while a bookmark, a
 * running class and the learner's own history keep resolving.
 */
export async function getPrograms(): Promise<Program[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select(HOME_PROGRAMS_SELECT)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  // RLS lets an admin read every learner's progress, so filter to the caller.
  // Best-effort: a failure here leaves every card at 0% instead of blanking the dashboard.
  const userId = await getIteraUserId();
  const { data: done } = userId
    ? await sb.from('progress').select('activity_id').eq('user_id', userId).eq('status', 'completed')
    : { data: [] };
  return homeProgramsOf(data, done);
}

/** Program tree (units → lessons → activities) by slug. Activities carry id, kind and status only: the trail reads nothing else, and the specs of a whole program are ~600 kB. */
export async function getProgramBySlug(slug: string): Promise<ProgramDetail> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select(
      `id, tenant_id, slug, title_i18n, created_at,
       units:units (
         id, program_id, ordinal, title_i18n,
         lessons:lessons (
           id, unit_id, ordinal, title_i18n,
           activities:activities ( id, lesson_id, ordinal, kind )
         )
       )`
    )
    .eq('slug', slug)
    .order('ordinal', { foreignTable: 'units', ascending: true })
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ProgramNotFoundError(slug);
  const row = data as Row;

  const units: Unit[] = asRows(row.units)
    .map((u) => ({
      id: str(u.id),
      programId: str(u.program_id),
      ordinal: num(u.ordinal),
      title: bag(u.title_i18n),
      lessons: asRows(u.lessons)
        .map((l) => ({
          id: str(l.id),
          unitId: str(l.unit_id),
          ordinal: num(l.ordinal),
          title: bag(l.title_i18n),
          activities: asRows(l.activities)
            .map((a) => mapActivity(a))
            .sort((x, y) => x.ordinal - y.ordinal),
        }))
        .sort((x, y) => x.ordinal - y.ordinal),
    }))
    .sort((x, y) => x.ordinal - y.ordinal);

  // Derive per-activity progress status for the signed-in user so the SkillTree
  // can compute lesson-done / unlock-the-next-lesson. WITHOUT this, every
  // activity.status was undefined → no lesson ever read as 'done' → the program
  // stuck at 0/N and lesson 2 stayed LOCKED even after lesson 1 was completed.
  // RLS does NOT scope itera.progress to the caller alone: admins and
  // instructors read every member of their tenant, so the query filters on the
  // caller's own user id. Best-effort: progress failures must not blank out the
  // course tree.
  const activityIds = units.flatMap((u) =>
    (u.lessons ?? []).flatMap((l) => (l.activities ?? []).map((a) => a.id))
  );
  const progress = await getLessonProgress(activityIds);
  for (const u of units) {
    for (const l of u.lessons ?? []) {
      for (const a of l.activities ?? []) {
        a.status = progress[a.id] ?? a.status;
      }
    }
  }

  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    slug: str(row.slug),
    title: bag(row.title_i18n),
    createdAt: str(row.created_at),
    units,
  };
}

/**
 * DB row → Activity. Exported because the GUEST content path (itera-api serves
 * the invited session's lesson — see guestSession.service) must produce exactly
 * the same Activity shape as the PostgREST path; two mappers would drift.
 */
export function mapActivity(a: Row): Activity {
  const kind = str(a.kind) as Activity['kind'];
  const rawSpec = a.spec && typeof a.spec === 'object' ? (a.spec as Record<string, unknown>) : {};
  return {
    id: str(a.id),
    lessonId: str(a.lesson_id),
    ordinal: num(a.ordinal),
    kind,
    // The sandbox runtime resolves its own bilingual bags; every other kind
    // renders spec strings directly, so collapse bags before they reach the DOM.
    // ⚠️ TODOS os kinds de sandbox, não só o legado: colapsar o bag de uma row
    // migrada reprova o spec na fronteira e o aluno perde o sandbox inteiro.
    spec: isScenarioKind(kind) ? rawSpec : resolveLocalizedSpec(rawSpec),
    // The rubric is bilingual too (`criteria[]`, `artifact` — the AI-judge
    // prompt and the artifact label). Nothing downstream resolves it, so an
    // unresolved bag here would reach the judge as "[object Object]" and would
    // render as one in the artifact name. Resolved for EVERY kind: unlike the
    // spec, no runtime takes a second pass at the rubric.
    rubric:
      a.rubric && typeof a.rubric === 'object'
        ? resolveLocalizedSpec(a.rubric as Record<string, unknown>)
        : null,
    // Carried raw; `resolveArtifactPolicy` merges it with the per-kind default.
    // The player needs it to decide whether to persist (migration 0027).
    artifactPolicy:
      a.artifact_policy && typeof a.artifact_policy === 'object'
        ? (a.artifact_policy as Record<string, unknown>)
        : null,
  };
}

/**
 * Where a lesson sits in the hierarchy. Carried alongside the activities so the
 * player can build an artifact's git-shaped `repo_path`
 * (`<program>/<NN-unit>/<NN-lesson>/<NN-activity>/<file>`) without a second
 * round-trip at the exact moment the learner finishes an activity.
 *
 * Every field is optional: the embed is best-effort, and a missing ancestor must
 * degrade to a shallower path, never block the save.
 */
export interface LessonPlacement {
  programSlug?: string | null;
  unitTitle?: import('@/types/content').I18nText | null;
  unitOrdinal?: number | null;
  lessonOrdinal?: number | null;
}

/**
 * Every lesson of one tenant's live programs, flattened in curriculum order.
 * The tenant filter is load-bearing: a class on another tenant's lesson leaves
 * learners with an RLS-blocked black screen.
 */
export async function getTenantLessons(tenantId: string): Promise<TenantLesson[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select(
      `id, slug, title_i18n, created_at,
       units:units ( id, ordinal, lessons:lessons ( id, ordinal, title_i18n ) )`
    )
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (error) throw new Error(error.message);

  return asRows(data)
    .sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)))
    .flatMap((program) =>
      asRows(program.units)
        .sort((a, b) => num(a.ordinal) - num(b.ordinal))
        .flatMap((unit) =>
          asRows(unit.lessons)
            .sort((a, b) => num(a.ordinal) - num(b.ordinal))
            .map((lesson) => ({
              id: str(lesson.id),
              title: bag(lesson.title_i18n),
              programId: str(program.id),
              programSlug: str(program.slug),
              programTitle: bag(program.title_i18n),
            }))
        )
    )
    .filter((l) => l.id);
}

/** Single lesson with its activities (used by the lesson player). */
export async function getLessonWithActivities(lessonId: string): Promise<{
  id: string;
  title: import('@/types/content').I18nText;
  activities: Activity[];
  placement: LessonPlacement;
}> {
  const sb = client();
  const { data, error } = await sb
    .from('lessons')
    .select(
      `id, title_i18n, ordinal,
       unit:units ( ordinal, title_i18n, program:programs ( slug ) ),
       activities:activities ( id, lesson_id, ordinal, kind, spec, rubric, artifact_policy )`
    )
    .eq('id', lessonId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Lesson not found: ${lessonId}`);
  const row = data as Row;

  const activities: Activity[] = asRows(row.activities)
    .map((a) => mapActivity(a))
    .sort((x, y) => x.ordinal - y.ordinal);

  const unit = asRow(row.unit);
  const program = unit ? asRow(unit.program) : undefined;

  return {
    id: str(row.id),
    title: bag(row.title_i18n),
    activities,
    placement: {
      programSlug: program?.slug ? str(program.slug) : null,
      unitTitle: unit?.title_i18n ? bag(unit.title_i18n) : null,
      unitOrdinal: unit && unit.ordinal !== undefined ? num(unit.ordinal) : null,
      lessonOrdinal: row.ordinal !== undefined ? num(row.ordinal) : null,
    },
  };
}

/**
 * Resolve the lesson that comes AFTER `lessonId` within the same program, in
 * canonical reading order (unit.ordinal, then lesson.ordinal). Returns the next
 * lesson's id + title, or `null` when this is the last lesson of the program
 * (or the lesson / program can't be resolved). Best-effort: any failure resolves
 * to `null` so the end-of-lesson CTA gracefully falls back to "Concluir".
 *
 * Used by the lesson player's completion screen (round-3 finding #4) to offer
 * "Próxima lição" instead of always bouncing the learner to the dashboard.
 */
export async function getNextLesson(
  lessonId: string
): Promise<{ id: string; title: import('@/types/content').I18nText } | null> {
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();

  // 1) Locate the current lesson's unit + ordinal, and walk up to the program.
  const { data: cur, error: curErr } = await sb
    .from('lessons')
    .select('id, ordinal, unit:units ( id, ordinal, program_id )')
    .eq('id', lessonId)
    .maybeSingle();
  if (curErr || !cur) return null;

  const curRow = cur as Row;
  const curUnit = (curRow.unit && typeof curRow.unit === 'object' ? (curRow.unit as Row) : null);
  if (!curUnit) return null;
  const programId = str(curUnit.program_id);
  const curUnitOrd = num(curUnit.ordinal);
  const curLessonOrd = num(curRow.ordinal);
  if (!programId) return null;

  // 2) Pull every lesson in the program (with its unit ordinal) and pick the
  //    first one strictly after the current position in (unit, lesson) order.
  const { data: units, error: unitsErr } = await sb
    .from('units')
    .select('ordinal, lessons:lessons ( id, ordinal, title_i18n )')
    .eq('program_id', programId)
    .order('ordinal', { ascending: true });
  if (unitsErr || !units) return null;

  type Flat = { id: string; title: import('@/types/content').I18nText; unitOrd: number; lessonOrd: number };
  const flat: Flat[] = asRows(units)
    .flatMap((u) =>
      asRows(u.lessons).map((l) => ({
        id: str(l.id),
        title: bag(l.title_i18n),
        unitOrd: num(u.ordinal),
        lessonOrd: num(l.ordinal),
      }))
    )
    .sort((a, b) => (a.unitOrd - b.unitOrd) || (a.lessonOrd - b.lessonOrd));

  const next = flat.find(
    (l) => l.unitOrd > curUnitOrd || (l.unitOrd === curUnitOrd && l.lessonOrd > curLessonOrd)
  );
  return next ? { id: next.id, title: next.title } : null;
}

/** Derived gamification stats for the signed-in user (best-effort, RLS-scoped). */
export async function getUserStats(): Promise<UserStats> {
  if (!isSupabaseConfigured) {
    return { totalXp: 0, streakDays: 0, badgeCount: 0, completedActivities: 0 };
  }
  const sb = getSupabase();
  const userId = await getIteraUserId();

  const [xp, badges, progress] = await Promise.all([
    sb.from('xp_events').select(HOME_XP_SELECT),
    sb.from('user_badges').select('badge_id'),
    // The itera.progress_status enum is ('not_started','in_progress','completed') —
    // there is NO 'done' value, so filtering on 'done' always returned zero rows
    // (completion counts stuck at 0). Use the real enum value.
    // Staff RLS also returns the tenant's members: count the caller's rows only.
    userId ? sb.from('progress').select('status').eq('user_id', userId).eq('status', 'completed') : { data: [] },
  ]);

  return homeStatsOf(xp.data, badges.data, progress.data);
}

/** Badges for the tenant, flagged earned for the current user. */
export async function getBadges(): Promise<Badge[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const [{ data: badges }, { data: earned }] = await Promise.all([
    sb.from('badges').select('id, slug, title_i18n, icon'),
    sb.from('user_badges').select('badge_id'),
  ]);
  return homeBadgesOf(badges, earned);
}

/**
 * Map of activityId → UI ProgressStatus for the current user.
 *
 * The DB enum ('not_started','in_progress','completed') is NORMALIZED into the
 * canonical UI value ('todo','in_progress','done') via normalizeProgressStatus.
 * Returning the raw 'completed' was the unlock-gate bug: SkillTree checks
 * `status === 'done'`, which never matched the DB's 'completed'.
 */
export async function getLessonProgress(activityIds: string[]): Promise<Record<string, ProgressStatus>> {
  if (!isSupabaseConfigured || activityIds.length === 0) return {};
  const userId = await getIteraUserId();
  if (!userId) return {};
  const sb = getSupabase();
  const { data } = await sb
    .from('progress')
    .select('activity_id, status')
    .eq('user_id', userId)
    .in('activity_id', activityIds);
  const map: Record<string, ProgressStatus> = {};
  for (const r of asRows(data)) map[str(r.activity_id)] = normalizeProgressStatus(str(r.status));
  return map;
}
