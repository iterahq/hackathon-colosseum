import { describe, it, expect } from 'vitest';
import { buildSections } from './buildSections';
import type { Activity, Lesson, ProgramDetail, ProgressStatus, Unit } from '@/types/content';

function activity(id: string, status: ProgressStatus): Activity {
  return { id, lessonId: 'l', ordinal: 0, kind: 'concept', spec: {}, rubric: null, status };
}

function lesson(id: string, statuses: ProgressStatus[]): Lesson {
  return {
    id,
    unitId: 'u',
    ordinal: 0,
    title: { pt: id, en: id },
    activities: statuses.map((s, i) => activity(`${id}-a${i}`, s)),
  };
}

function unit(id: string, lessons: Lesson[]): Unit {
  return { id, programId: 'p', ordinal: 0, title: { pt: id, en: id }, lessons };
}

function program(units: Unit[]): ProgramDetail {
  return {
    id: 'p',
    tenantId: 't',
    slug: 'p',
    title: { pt: 'p', en: 'p' },
    createdAt: '2026-08-24T00:00:00Z',
    units,
  };
}

const states = (program: ProgramDetail) => buildSections(program).map((s) => s.nodes.map((n) => n.state));

describe('buildSections', () => {
  it('opens each unit at its own first unfinished lesson', () => {
    // Breaks if the frontier goes back to being program-wide: unit 2 would read
    // ['locked', 'locked'] and the learner would lose the path into it.
    expect(
      states(
        program([
          unit('u1', [lesson('l1', ['in_progress']), lesson('l2', ['todo'])]),
          unit('u2', [lesson('l3', ['todo']), lesson('l4', ['todo'])]),
        ])
      )
    ).toEqual([
      ['current', 'locked'],
      ['current', 'locked'],
    ]);
  });

  it('keeps a finished unit fully unlocked when an earlier unit is unfinished', () => {
    expect(
      states(
        program([
          unit('u1', [lesson('l1', ['todo'])]),
          unit('u2', [lesson('l2', ['done']), lesson('l3', ['done'])]),
        ])
      )
    ).toEqual([['current'], ['done', 'done']]);
  });

  it('marks the lesson after the last done one as current, inside the unit', () => {
    expect(states(program([unit('u1', [lesson('l1', ['done']), lesson('l2', ['todo']), lesson('l3', ['todo'])])]))).toEqual([
      ['done', 'current', 'locked'],
    ]);
  });

  it('accepts the raw DB value "completed" as done', () => {
    expect(states(program([unit('u1', [lesson('l1', ['completed' as ProgressStatus])])]))).toEqual([['done']]);
  });

  it('needs every activity done, not just the first', () => {
    expect(states(program([unit('u1', [lesson('l1', ['done', 'in_progress'])])]))).toEqual([['current']]);
  });

  it('never counts an empty lesson as done', () => {
    expect(states(program([unit('u1', [lesson('l1', [])])]))).toEqual([['current']]);
  });

  it('reports doneCount and total per unit', () => {
    const [u1, u2] = buildSections(
      program([
        unit('u1', [lesson('l1', ['done']), lesson('l2', ['todo'])]),
        unit('u2', []),
      ])
    );
    expect(u1).toMatchObject({ doneCount: 1, total: 2, index: 0 });
    expect(u2).toMatchObject({ doneCount: 0, total: 0, index: 1 });
  });
});
