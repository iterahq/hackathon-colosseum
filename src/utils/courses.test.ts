import { describe, expect, it } from 'vitest';
import { courseColorIndex, glyphOf, trailHref, trailIdFromHash } from '@/utils/courses';
import { programTrails, programTotals } from '@/utils/coursesProgram';

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
