import type { ProgramDetail, Activity } from '@/types/content';

const act = (
  id: string,
  status: Activity['status'],
  kind: Activity['kind'] = 'document',
): Activity => ({
  id,
  lessonId: 'l',
  ordinal: 0,
  kind,
  spec: {},
  rubric: null,
  status,
});

export const program: ProgramDetail = {
  id: 'p1',
  tenantId: 't1',
  slug: 'tech-fluency',
  title: { en: 'Tech Fluency: Speak Dev, AI & GitHub' },
  createdAt: new Date().toISOString(),
  icon: 'code',
  units: [
    {
      id: 'u1',
      programId: 'p1',
      ordinal: 0,
      title: { en: '01 · The Words Devs Use' },
      lessons: [
        { id: 'l1', unitId: 'u1', ordinal: 0, title: { en: 'What is a "repo"?' }, activities: [act('a1', 'done', 'document')] },
        { id: 'l2', unitId: 'u1', ordinal: 1, title: { en: 'Branch, commit, merge' }, activities: [act('a2', 'done', 'diagram')] },
        { id: 'l3', unitId: 'u1', ordinal: 2, title: { en: 'Pull requests' }, activities: [act('a3', 'todo', 'quiz')] },
      ],
    },
    {
      id: 'u2',
      programId: 'p1',
      ordinal: 1,
      title: { en: '02 · How Code Gets Built' },
      lessons: [
        { id: 'l4', unitId: 'u2', ordinal: 0, title: { en: 'Idea to ship' }, activities: [act('a4', 'todo', 'code')] },
        { id: 'l5', unitId: 'u2', ordinal: 1, title: { en: 'CI / CD basics' }, activities: [act('a5', 'todo', 'document')] },
      ],
    },
    {
      id: 'u3',
      programId: 'p1',
      ordinal: 2,
      title: { en: '03 · Ship It Together' },
      lessons: [
        { id: 'l6', unitId: 'u3', ordinal: 0, title: { en: 'Code review basics' }, activities: [act('a6', 'todo', 'quiz')] },
        { id: 'l7', unitId: 'u3', ordinal: 1, title: { en: 'Your first PR' }, activities: [act('a7', 'todo', 'document')] },
      ],
    },
  ],
};

const lessonWith = (unit: number, n: number, title: string, statuses: Activity['status'][]) => ({
  id: `f${unit}-${n}`,
  unitId: `fu${unit}`,
  ordinal: n,
  title: { en: title },
  activities: statuses.map((s, i) =>
    act(`fa${unit}-${n}-${i}`, s, (['document', 'quiz', 'code'] as const)[i % 3]),
  ),
});

const titles = [
  ['What a database is', 'Tables and rows', 'Primary keys', 'Relating tables', 'Your first schema'],
  ['Reading with SELECT', 'Filtering with WHERE', 'Sorting and limiting', 'Joining tables', 'Grouping results'],
  ['Inserting data', 'Updating safely', 'Deleting with care', 'Transactions', 'Indexes in practice'],
];

const trailWith = (pick: (unit: number, lesson: number) => Activity['status'][]): ProgramDetail => ({
  ...program,
  title: { en: 'Databases from Zero' },
  units: titles.map((unitTitles, u) => ({
    id: `fu${u}`,
    programId: 'p1',
    ordinal: u,
    title: { en: ['Storing data', 'Asking questions', 'Changing data'][u] },
    lessons: unitTitles.map((title, n) => lessonWith(u, n, title, pick(u, n))),
  })),
});

/** Unit 1 done, unit 2 lesson 2 half done — the learner is mid-trail. */
export const fixtureProgram = trailWith((u, n) => {
  if (u === 0 || (u === 1 && n === 0)) return ['done', 'done', 'done'];
  if (u === 1 && n === 1) return ['done', 'todo', 'todo'];
  return ['todo', 'todo', 'todo'];
});

export const freshProgram = trailWith(() => ['todo', 'todo', 'todo']);

export const completedProgram = trailWith(() => ['done', 'done', 'done']);

/** Unit 3 has no lessons yet — next week not launched. */
export const unlaunchedUnitProgram: ProgramDetail = {
  ...fixtureProgram,
  units: fixtureProgram.units.map((unit, u) => (u === 2 ? { ...unit, lessons: [] } : unit)),
};
