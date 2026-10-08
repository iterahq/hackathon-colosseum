/**
 * The dashboard as the universal home screen draws it: the rows of the backend as programs, stats and
 * medals, and the view read off the state of those reads. Pure: each host (the web's `useHomeScreen`, the
 * shell's `homeHost`) gives it its own i18n lookups and the state of its own reads.
 */
import type { CatalogCardView, CatalogListState } from '../ports/catalog';
import type { HomeBadgesState, HomeStatsView, HomeView } from '../ports/home';
import { listStateOf, toCardView, type CardContext, type CatalogProgram } from '../catalog/model';
import type { LocalText } from '../text/localText';

/** A program the learner can open, with the counts and the progress of its card. */
export interface HomeProgram {
  id: string;
  tenantId: string;
  slug: string;
  title: LocalText;
  createdAt: string;
  unitCount?: number;
  lessonCount?: number;
  activityCount?: number;
  completedCount?: number;
  icon?: string;
}

export interface HomeStats {
  totalXp: number;
  streakDays: number;
  badgeCount: number;
  completedActivities: number;
}

export interface HomeBadge {
  id: string;
  slug: string;
  title: LocalText;
  icon: string | null;
  earned?: boolean;
}

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const bag = (v: unknown): Record<string, string> => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

const ICONS = ['code', 'layers', 'rocket', 'cpu', 'sparkles'];
/** A stable icon by position, so each program card keeps its glyph and its tone. */
export const iconFor = (index: number): string => ICONS[index % ICONS.length];

/** The select of `itera.programs` the dashboard reads: each program with the ids of its tree, to count them. */
export const HOME_PROGRAMS_SELECT = 'id, tenant_id, slug, title_i18n, created_at, units:units ( id, lessons:lessons ( id, activities:activities ( id ) ) )';

/**
 * The same programs read with the counting done by the backend, for a host whose answers are capped (the
 * shell): each lesson carries the COUNT of its activities, not their ids, so the answer grows with the
 * lessons of the tenant and not with its activities.
 */
export const HOME_PROGRAMS_COUNT_SELECT = 'id,tenant_id,slug,title_i18n,created_at,units(lessons(activities(count)))';
/** The learner's completed `progress`, each row naming the program of its activity: what the counting read cannot tell by id. */
export const HOME_COMPLETED_BY_PROGRAM_SELECT = 'activities(lessons(units(program_id)))';

const one = (v: unknown): Row => ((Array.isArray(v) ? v[0] : v) ?? {}) as Row;

/** Rows of `programs` (with `HOME_PROGRAMS_COUNT_SELECT`) and of `progress` (with `HOME_COMPLETED_BY_PROGRAM_SELECT`), as the programs `homeProgramsOf` gives. */
export function homeProgramsOfCounts(programRows: unknown, completedRows: unknown): HomeProgram[] {
  const completed = new Map<string, number>();
  for (const row of asRows(completedRows)) {
    const programId = str(one(one(one(row.activities).lessons).units).program_id);
    if (programId !== '') completed.set(programId, (completed.get(programId) ?? 0) + 1);
  }
  return asRows(programRows).map((row, i) => {
    const units = asRows(row.units);
    const lessons = units.flatMap((u) => asRows(u.lessons));
    const activityCount = lessons.reduce((sum, l) => sum + num(one(l.activities).count), 0);
    const id = str(row.id);
    return {
      id,
      tenantId: str(row.tenant_id),
      slug: str(row.slug),
      title: bag(row.title_i18n),
      createdAt: str(row.created_at),
      unitCount: units.length,
      lessonCount: lessons.length,
      activityCount,
      completedCount: Math.min(completed.get(id) ?? 0, activityCount),
      icon: iconFor(i),
    };
  });
}

/** Rows of `programs` (with `HOME_PROGRAMS_SELECT`) and the learner's completed rows of `progress`, as programs. */
export function homeProgramsOf(programRows: unknown, completedRows: unknown): HomeProgram[] {
  const completed = new Set(asRows(completedRows).map((r) => str(r.activity_id)));
  return asRows(programRows).map((row, i) => {
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
      completedCount: activities.filter((a) => completed.has(str(a.id))).length,
      icon: iconFor(i),
    };
  });
}

/** The select of `itera.xp_events` the dashboard reads: the amounts for the total, the dates for the streak. */
export const HOME_XP_SELECT = 'amount, created_at';

const dayOf = (date: Date): number => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/**
 * The learner's streak: how many days in a row, up to today, have at least one XP event. A day is the
 * learner's own calendar day (the device's time zone). Today without an event yet does not break a streak
 * that reached yesterday; a day missed does.
 */
export function streakDaysOf(xpRows: unknown, now: Date): number {
  const days = new Set<number>();
  for (const row of asRows(xpRows)) {
    const at = new Date(str(row.created_at));
    if (!Number.isNaN(at.getTime())) days.add(dayOf(at));
  }
  const today = dayOf(now);
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

/** Rows of `xp_events` (with `HOME_XP_SELECT`), of `user_badges` and of the learner's completed `progress`, as the four counts. */
export function homeStatsOf(xpRows: unknown, userBadgeRows: unknown, completedRows: unknown, now: Date = new Date()): HomeStats {
  return {
    totalXp: asRows(xpRows).reduce((sum, r) => sum + num(r.amount), 0),
    streakDays: streakDaysOf(xpRows, now),
    badgeCount: asRows(userBadgeRows).length,
    completedActivities: asRows(completedRows).length,
  };
}

/** Rows of `badges` and of `user_badges`, as medals flagged earned. */
export function homeBadgesOf(badgeRows: unknown, userBadgeRows: unknown): HomeBadge[] {
  const earned = new Set(asRows(userBadgeRows).map((r) => str(r.badge_id)));
  return asRows(badgeRows).map((b) => ({ id: str(b.id), slug: str(b.slug), title: bag(b.title_i18n), icon: typeof b.icon === 'string' ? b.icon : null, earned: earned.has(str(b.id)) }));
}

type Bucket = 0 | 1 | 2;

function bucketOf(p: HomeProgram): Bucket {
  const total = p.activityCount ?? 0;
  const done = p.completedCount ?? 0;
  if (total > 0 && done >= total) return 2;
  if (done > 0 && done < total) return 0;
  return 1;
}

function createdAtMs(p: HomeProgram): number {
  const ms = Date.parse(p.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Home grid order: in progress first, then untouched newest-first, finished last. */
export function orderHomePrograms<P extends HomeProgram>(programs: readonly P[]): P[] {
  return [...programs].sort((a, b) => {
    const byBucket = bucketOf(a) - bucketOf(b);
    if (byBucket !== 0) return byBucket;
    return createdAtMs(b) - createdAtMs(a);
  });
}

type Lookups = Pick<CardContext, 't' | 'tText'>;

/** The whole percent of a program's activities the learner has completed. */
export function percentOf(program: HomeProgram): number {
  const total = program.activityCount ?? 0;
  return total > 0 ? Math.round(((program.completedCount ?? 0) / total) * 100) : 0;
}

/** The dashboard's card of an enrolled program: the catalog card with the progress foot. */
export function toEnrolledCardView(program: HomeProgram, lookups: Lookups): CatalogCardView {
  const percent = percentOf(program);
  const course: CatalogProgram = { ...program, tenantSlug: '', unitCount: program.unitCount ?? 0, lessonCount: program.lessonCount ?? 0, activityCount: program.activityCount ?? 0, alreadyEnrolled: true };
  const card = toCardView(course, { ...lookups, visitor: false, offer: undefined, enrolling: {} });
  return { ...card, action: { kind: 'enrolled', percent, progress: lookups.t('program.percentComplete').replace('{n}', String(percent)) } };
}

export interface HomeReads extends Lookups {
  /** No active subscription. The reads of a member are then not made, and the catalog is read instead. */
  visitor: boolean;
  /** The learner's e-mail, for the welcome line. */
  email: string | null | undefined;
  /** The search of the header (`?q=`): filters a member's programs by title. */
  search: string;
  programs: { isPending: boolean; isError: boolean; data: readonly HomeProgram[] | undefined };
  stats: { isPending: boolean; data: HomeStats | undefined };
  badges: { isPending: boolean; data: readonly HomeBadge[] | undefined };
  catalog: { isPending: boolean; isError: boolean; data: readonly CatalogProgram[] | undefined };
  /** The visitor's offer and hint, worded by the host. Absent where the host sells nothing. */
  offer: CardContext['offer'];
  hint: string | undefined;
}

export function statsViewOf(email: string | null | undefined, stats: HomeReads['stats']): HomeStatsView {
  const count = (n: number | undefined) => (stats.isPending ? '–' : String(n ?? 0));
  return {
    name: email?.split('@')[0] ?? 'Learner',
    initials: (email ?? 'IT').slice(0, 2).toUpperCase(),
    streak: count(stats.data?.streakDays),
    xp: count(stats.data?.totalXp),
    badges: count(stats.data?.badgeCount),
    completed: count(stats.data?.completedActivities),
  };
}

function badgesStateOf({ isPending, data }: HomeReads['badges'], tText: Lookups['tText']): HomeBadgesState {
  if (isPending) return { kind: 'loading' };
  if (!data || data.length === 0) return { kind: 'empty' };
  return { kind: 'ready', badges: data.map((b) => ({ id: b.id, title: tText(b.title), earned: b.earned === true })) };
}

function enrolledStateOf(reads: HomeReads): CatalogListState {
  const { programs, search, t, tText } = reads;
  if (programs.isPending) return { kind: 'loading' };
  if (programs.isError) return { kind: 'error', unreachable: false };
  const ordered = orderHomePrograms(programs.data ?? []);
  const shown = search ? ordered.filter((p) => tText(p.title).toLowerCase().includes(search)) : ordered;
  if (shown.length === 0) return { kind: 'empty' };
  return { kind: 'ready', programs: shown.map((p) => toEnrolledCardView(p, { t, tText })) };
}

export function homeViewOf(reads: HomeReads): HomeView {
  const { t, tText } = reads;
  if (reads.visitor) {
    const { catalog } = reads;
    const programs = listStateOf({ isPending: catalog.isPending, isError: catalog.isError, unreachable: false }, catalog.data ?? [], { visitor: true, offer: reads.offer, enrolling: {}, t, tText });
    return { kind: 'visitor', programs, hint: reads.hint };
  }
  return { kind: 'member', stats: statsViewOf(reads.email, reads.stats), programs: enrolledStateOf(reads), badges: badgesStateOf(reads.badges, tText) };
}
