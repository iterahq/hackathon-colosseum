import { describe, expect, it } from 'vitest';
import type { CatalogProgram } from '@/types/catalog';
import type { Trail } from '@/types/trailDashboard';
import { buildCourses, countByFilter, courseColorIndex, filterCourses, glyphOf, pickFeaturedCourse, trailHref, trailIdFromHash } from '@/utils/courses';
import { programTrails, programTotals } from '@/utils/coursesProgram';

const trail = (over: Partial<Trail> & { programSlug: string }): Trail => ({
  id: `u-${over.programSlug}-${over.title?.pt ?? 'x'}`,
  programTitle: { pt: over.programSlug },
  title: { pt: 'T' },
  days: [{ id: 'd1', title: { pt: 'Dia 1' }, total: 2, done: 0, state: 'current' }],
  totalActivities: 2,
  doneActivities: 0,
  doneDays: 0,
  status: 'fresh',
  lastProgressAt: null,
  unlockedBy: null,
  colorIndex: 0,
  ...over,
});

const catalogProgram = (slug: string, over: Partial<CatalogProgram> = {}): CatalogProgram => ({
  id: `c-${slug}`,
  tenantId: 't',
  tenantSlug: 'itera',
  slug,
  title: { pt: slug },
  createdAt: '2026-01-01T00:00:00Z',
  unitCount: 3,
  lessonCount: 9,
  activityCount: 30,
  alreadyEnrolled: false,
  ...over,
});

describe('buildCourses', () => {
  const trails = [
    trail({ programSlug: 'a', status: 'done', doneActivities: 2, doneDays: 1, lastProgressAt: 10, days: [{ id: 'd1', title: {}, total: 2, done: 2, state: 'done' }] }),
    trail({ id: 'u2', programSlug: 'a', status: 'in_progress', doneActivities: 1, lastProgressAt: 50, unlockedBy: null, days: [{ id: 'd2', title: {}, total: 2, done: 1, state: 'current' }] }),
    trail({ programSlug: 'b' }),
  ];
  const courses = buildCourses(trails, [catalogProgram('b'), catalogProgram('z', { createdAt: '2026-02-01T00:00:00Z' })]);

  it('groups trails by program, then appends catalog-only programs', () => {
    expect(courses.map((c) => c.slug)).toEqual(['a', 'b', 'z']);
    expect(courses[0]).toMatchObject({ units: 2, lessons: 2, activities: 4, doneActivities: 3, state: 'in_progress', lastProgressAt: 50, origin: 'cohort', resumeLessonId: 'd2' });
    expect(courses[0].dots).toEqual(['done', 'current']);
  });

  it('tags a learner program that is also in the catalog as catalog', () => {
    expect(courses[1]).toMatchObject({ origin: 'catalog', state: 'new', enrolled: true });
  });

  it('keeps a catalog-only program unstarted, with one dot per unit', () => {
    expect(courses[2]).toMatchObject({ origin: 'catalog', enrolled: false, state: 'new', units: 3, doneActivities: 0 });
    expect(courses[2].dots).toEqual(['current', 'locked', 'locked']);
  });

  it('marks a fully completed course as done', () => {
    const [done] = buildCourses([trail({ programSlug: 'c', status: 'done', doneActivities: 2, doneDays: 1 })], []);
    expect(done.state).toBe('done');
  });

  it('counts and filters by state', () => {
    expect(countByFilter(courses)).toEqual({ all: 3, in_progress: 1, new: 2, done: 0 });
    expect(filterCourses(courses, 'new').map((c) => c.slug)).toEqual(['b', 'z']);
    expect(filterCourses(courses, 'all')).toHaveLength(3);
  });
});

describe('pickFeaturedCourse', () => {
  it('prefers the most recent in-progress course, then the first unstarted, then the first', () => {
    const [a, b] = buildCourses(
      [
        trail({ programSlug: 'a', status: 'in_progress', doneActivities: 1, lastProgressAt: 5 }),
        trail({ programSlug: 'b', status: 'in_progress', doneActivities: 1, lastProgressAt: 9 }),
      ],
      [],
    );
    expect(pickFeaturedCourse([a, b])?.slug).toBe('b');
    const fresh = buildCourses([trail({ programSlug: 'f' })], []);
    expect(pickFeaturedCourse(fresh)?.slug).toBe('f');
    const done = buildCourses([trail({ programSlug: 'd', status: 'done', doneActivities: 2, doneDays: 1 })], []);
    expect(pickFeaturedCourse(done)?.slug).toBe('d');
    expect(pickFeaturedCourse([])).toBeNull();
  });
});

describe('helpers', () => {
  it('derives a stable accent and a 3-letter glyph from the slug', () => {
    expect(courseColorIndex('itera-v2')).toBe(courseColorIndex('itera-v2'));
    expect(courseColorIndex('x')).toBeLessThan(5);
    expect(glyphOf('itera-v2')).toBe('ITE');
    expect(glyphOf('')).toBe('···');
  });
});

describe('programTrails', () => {
  const act = (id: string, status?: string) => ({ id, lessonId: 'l', ordinal: 1, kind: 'document', spec: {}, rubric: null, status }) as never;
  const program = {
    id: 'p',
    tenantId: 't',
    slug: 'p',
    title: { pt: 'P' },
    createdAt: '2026-01-01T00:00:00Z',
    units: [
      { id: 'u1', programId: 'p', ordinal: 1, title: { pt: 'Semana 1 · HTML' }, lessons: [{ id: 'l1', unitId: 'u1', ordinal: 1, title: { pt: 'Dia 1' }, activities: [act('a1', 'done'), act('a2', 'completed')] }, { id: 'l2', unitId: 'u1', ordinal: 2, title: { pt: 'Dia 2' }, activities: [act('a3', 'todo')] }] },
      { id: 'u2', programId: 'p', ordinal: 2, title: { pt: 'Semana 2 · CSS' }, lessons: [{ id: 'l3', unitId: 'u2', ordinal: 1, title: { pt: 'Dia 1' }, activities: [act('a4')] }] },
    ],
  } as never;

  it('unlocks units in order and marks the current day', () => {
    const trails = programTrails(program);
    expect(trails.map((t) => t.status)).toEqual(['in_progress', 'locked']);
    expect(trails[0].days.map((d) => d.state)).toEqual(['done', 'current']);
    expect(programTotals(trails)).toEqual({ units: 2, lessons: 3, activities: 4, doneActivities: 2, doneLessons: 1 });
  });
});

describe('trail deep links', () => {
  it('builds the href and resolves it back from the hash', () => {
    expect(trailHref('itera-v2', 'u1')).toBe('/program/itera-v2#trail-u1');
    expect(trailIdFromHash('#trail-u1', ['u0', 'u1'])).toBe('u1');
    expect(trailIdFromHash('#trail-nope', ['u1'])).toBeNull();
    expect(trailIdFromHash('#other', ['u1'])).toBeNull();
    expect(trailIdFromHash('', ['u1'])).toBeNull();
    expect(trailIdFromHash('#trail-%E0%A4%A', ['u1'])).toBeNull();
  });
});
