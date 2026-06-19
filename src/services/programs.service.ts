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
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type {
  Activity,
  Badge,
  Program,
  ProgramDetail,
  ProgressStatus,
  UserStats,
} from '@/types/content';

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  return getSupabase();
}

/** Evergreen-family accents so each program card gets a stable colored glow. */
const ACCENTS = [
  'from-emerald-500 to-teal-700',
  'from-menta to-verde-tech',
  'from-green-500 to-emerald-700',
  'from-teal-500 to-green-700',
  'from-lime-500 to-emerald-700',
];
const ICONS = ['code', 'layers', 'rocket', 'cpu', 'sparkles'];

function accentFor(index: number) {
  return ACCENTS[index % ACCENTS.length];
}
function iconFor(index: number) {
  return ICONS[index % ICONS.length];
}

/* ── Raw Supabase row shapes (PostgREST nested selects return loose JSON) ── */
type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const bag = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

/**
 * List all programs the current user/tenant can see, with derived counts.
 * RLS scopes the rows to the user's tenant; anonymous sessions see public rows
 * only (per the schema's policies).
 */
export async function getPrograms(): Promise<Program[]> {
  const sb = client();
  const { data, error } = await sb
    .from('programs')
    .select(
      `id, tenant_id, slug, title_i18n, created_at,
       units:units ( id, lessons:lessons ( id, activities:activities ( id ) ) )`
    )
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return asRows(data).map((row, i) => {
    const units = asRows(row.units);
    const lessons = units.flatMap((u) => asRows(u.lessons));
    const activities = lessons.flatMap((l) => asRows(l.activities));
    return {
      id: str(row.id),
      tenantId: str(row.tenant_id),
      slug: str(row.slug),
      title: bag(row.title_i18n),
      createdAt: str(row.created_at),
      unitCount: units.length,
      lessonCount: lessons.length,
      activityCount: activities.length,
      accent: accentFor(i),
      icon: iconFor(i),
    } satisfies Program;
  });
}

/** Full program tree (units → lessons → activities) by slug. */
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
           activities:activities ( id, lesson_id, ordinal, kind, spec, rubric )
         )
       )`
    )
    .eq('slug', slug)
    .order('ordinal', { foreignTable: 'units', ascending: true })
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Program not found: ${slug}`);
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

  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    slug: str(row.slug),
    title: bag(row.title_i18n),
    createdAt: str(row.created_at),
    units,
  };
}

function mapActivity(a: Row): Activity {
  return {
    id: str(a.id),
    lessonId: str(a.lesson_id),
    ordinal: num(a.ordinal),
    kind: str(a.kind) as Activity['kind'],
    spec: (a.spec && typeof a.spec === 'object' ? (a.spec as Record<string, unknown>) : {}),
    rubric: (a.rubric && typeof a.rubric === 'object' ? (a.rubric as Record<string, unknown>) : null),
  };
}

/** Single lesson with its activities (used by the lesson player). */
export async function getLessonWithActivities(lessonId: string): Promise<{
  id: string;
  title: import('@/types/content').I18nText;
  activities: Activity[];
}> {
  const sb = client();
  const { data, error } = await sb
    .from('lessons')
    .select(
      `id, title_i18n,
       activities:activities ( id, lesson_id, ordinal, kind, spec, rubric )`
    )
    .eq('id', lessonId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Lesson not found: ${lessonId}`);
  const row = data as Row;

  const activities: Activity[] = asRows(row.activities)
    .map((a) => mapActivity(a))
    .sort((x, y) => x.ordinal - y.ordinal);

  return { id: str(row.id), title: bag(row.title_i18n), activities };
}

/** Derived gamification stats for the signed-in user (best-effort, RLS-scoped). */
export async function getUserStats(): Promise<UserStats> {
  if (!isSupabaseConfigured) {
    return { totalXp: 0, streakDays: 0, badgeCount: 0, completedActivities: 0 };
  }
  const sb = getSupabase();

  const [xp, badges, progress] = await Promise.all([
    sb.from('xp_events').select('amount'),
    sb.from('user_badges').select('badge_id'),
    sb.from('progress').select('status').eq('status', 'done'),
  ]);

  const totalXp = asRows(xp.data).reduce((s, r) => s + num(r.amount), 0);
  return {
    totalXp,
    // Streak needs an events table walk; show 0 until xp_events has timestamps wired.
    streakDays: 0,
    badgeCount: asRows(badges.data).length,
    completedActivities: asRows(progress.data).length,
  };
}

/** Badges for the tenant, flagged earned for the current user. */
export async function getBadges(): Promise<Badge[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const [{ data: badges }, { data: earned }] = await Promise.all([
    sb.from('badges').select('id, slug, title_i18n, icon'),
    sb.from('user_badges').select('badge_id'),
  ]);
  const earnedSet = new Set(asRows(earned).map((r) => str(r.badge_id)));
  return asRows(badges).map((b) => ({
    id: str(b.id),
    slug: str(b.slug),
    title: bag(b.title_i18n),
    icon: typeof b.icon === 'string' ? b.icon : null,
    earned: earnedSet.has(str(b.id)),
  }));
}

/** Map of activityId → status for a lesson (current user). */
export async function getLessonProgress(activityIds: string[]): Promise<Record<string, ProgressStatus>> {
  if (!isSupabaseConfigured || activityIds.length === 0) return {};
  const sb = getSupabase();
  const { data } = await sb
    .from('progress')
    .select('activity_id, status')
    .in('activity_id', activityIds);
  const map: Record<string, ProgressStatus> = {};
  for (const r of asRows(data)) map[str(r.activity_id)] = str(r.status) as ProgressStatus;
  return map;
}
