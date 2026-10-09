/**
 * Pure view-model of the Courses area: a course is a program, a trail is a unit, a day is a lesson.
 * Folds the learner's trails (programs they can read, with progress) and the self-serve catalog into
 * one list, filters it and picks the featured course.
 */
import type { CatalogProgram } from '@/types/catalog';
import type { I18nText } from '@/types/content';
import type { Trail } from '@/types/trailDashboard';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

export type CourseState = 'new' | 'in_progress' | 'done';
export type CourseFilter = 'all' | 'in_progress' | 'new' | 'done';
export type CourseOrigin = 'cohort' | 'catalog';
export type DotState = 'done' | 'current' | 'locked';

export interface Course {
  id: string;
  slug: string;
  title: I18nText;
  origin: CourseOrigin;
  /** True once the learner can open it (they hold a membership that reads the program). */
  enrolled: boolean;
  units: number;
  lessons: number;
  activities: number;
  doneLessons: number;
  doneActivities: number;
  state: CourseState;
  lastProgressAt: number | null;
  dots: DotState[];
  /** The lesson to open on "Continue", when the learner has one. */
  resumeLessonId: string | null;
}

export const FILTERS: readonly CourseFilter[] = ['all', 'in_progress', 'new', 'done'];
const MAX_DOTS = 8;

/** Stable accent of a course: the card, the hero and the program page agree without sharing a list. */
export function courseColorIndex(slug: string): number {
  let sum = 0;
  for (const ch of slug) sum += ch.charCodeAt(0);
  return sum % TRAIL_COLORS.length;
}

export const courseColor = (slug: string) => TRAIL_COLORS[courseColorIndex(slug)];

/** Three-letter mono glyph of a course card. */
export const glyphOf = (slug: string): string => slug.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || '···';

const stateOf = (done: number, total: number, hasProgress: boolean): CourseState =>
  total > 0 && done >= total ? 'done' : hasProgress ? 'in_progress' : 'new';

function dotsOf(trails: readonly Trail[]): DotState[] {
  return trails.map((t) => (t.status === 'done' ? 'done' : t.status === 'locked' ? 'locked' : 'current'));
}

function fromTrails(slug: string, trails: readonly Trail[], catalog: CatalogProgram | undefined): Course {
  const lessons = trails.reduce((n, t) => n + t.days.length, 0);
  const activities = trails.reduce((n, t) => n + t.totalActivities, 0);
  const doneActivities = trails.reduce((n, t) => n + t.doneActivities, 0);
  const last = trails.reduce<number | null>((m, t) => (t.lastProgressAt != null && (m == null || t.lastProgressAt > m) ? t.lastProgressAt : m), null);
  const open = trails.find((t) => t.status === 'in_progress' || t.status === 'fresh');
  return {
    id: catalog?.id ?? trails[0].id,
    slug,
    title: trails[0].programTitle,
    origin: catalog ? 'catalog' : 'cohort',
    enrolled: true,
    units: trails.length,
    lessons,
    activities,
    doneLessons: trails.reduce((n, t) => n + t.doneDays, 0),
    doneActivities,
    state: stateOf(doneActivities, activities, doneActivities > 0 || trails.some((t) => t.status === 'in_progress')),
    lastProgressAt: last,
    dots: dotsOf(trails),
    resumeLessonId: open?.days.find((d) => d.state === 'current')?.id ?? null,
  };
}

function fromCatalog(p: CatalogProgram): Course {
  const dots: DotState[] = Array.from({ length: Math.min(p.unitCount, MAX_DOTS) }, (_, i) => (i === 0 ? 'current' : 'locked'));
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    origin: 'catalog',
    enrolled: p.alreadyEnrolled,
    units: p.unitCount,
    lessons: p.lessonCount,
    activities: p.activityCount,
    doneLessons: 0,
    doneActivities: 0,
    state: 'new',
    lastProgressAt: null,
    dots,
    resumeLessonId: null,
  };
}

/** Learner programs first (in trail order), then the catalog ones the learner has not opened yet. */
export function buildCourses(trails: readonly Trail[], catalog: readonly CatalogProgram[]): Course[] {
  const bySlug = new Map<string, Trail[]>();
  for (const trail of trails) bySlug.set(trail.programSlug, [...(bySlug.get(trail.programSlug) ?? []), trail]);
  const catalogBySlug = new Map(catalog.map((p) => [p.slug, p]));

  const courses = [...bySlug].map(([slug, list]) => fromTrails(slug, list, catalogBySlug.get(slug)));
  const known = new Set(bySlug.keys());
  const rest = catalog.filter((p) => !known.has(p.slug)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.slug.localeCompare(b.slug));
  return [...courses, ...rest.map(fromCatalog)];
}

export const filterCourses = (courses: readonly Course[], filter: CourseFilter): Course[] =>
  filter === 'all' ? [...courses] : courses.filter((c) => c.state === filter);

export function countByFilter(courses: readonly Course[]): Record<CourseFilter, number> {
  return {
    all: courses.length,
    in_progress: courses.filter((c) => c.state === 'in_progress').length,
    new: courses.filter((c) => c.state === 'new').length,
    done: courses.filter((c) => c.state === 'done').length,
  };
}

/** The course the learner is in the middle of (latest progress), else the first not started, else the first. */
export function pickFeaturedCourse(courses: readonly Course[]): Course | null {
  const started = courses.filter((c) => c.state === 'in_progress');
  if (started.length > 0) {
    return started.reduce((best, c) => ((c.lastProgressAt ?? 0) > (best.lastProgressAt ?? 0) ? c : best));
  }
  return courses.find((c) => c.state === 'new') ?? courses[0] ?? null;
}

const TRAIL_HASH = '#trail-';

/** Deep link to one trail (unit) on the course page. */
export const trailHref = (programSlug: string, unitId: string): string => `/program/${programSlug}${TRAIL_HASH}${unitId}`;

/** The unit a URL hash points at, when one of `unitIds` matches. */
export function trailIdFromHash(hash: string, unitIds: readonly string[]): string | null {
  if (!hash.startsWith(TRAIL_HASH)) return null;
  let id = hash.slice(TRAIL_HASH.length);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return unitIds.includes(id) ? id : null;
}
