import { describe, expect, it } from 'vitest';
import { computeAwards, GLOBAL_REF, localParts, type Award, type AwardsInput, type ProgressRow } from './awards';

const TZ = 'America/Sao_Paulo';
const PROGRAM = 'p1';
const UNIT = 'u1';
const DAYS = ['l1', 'l2', 'l3', 'l4', 'l5'];
const activitiesOf = (lessonId: string) => [`${lessonId}-a`, `${lessonId}-b`];

function tree(): Pick<AwardsInput, 'programs' | 'units' | 'lessons' | 'activities'> {
  return {
    programs: [{ id: PROGRAM, slug: 'itera-v2', title: { en: 'Itera v2' } }],
    units: [{ id: UNIT, program_id: PROGRAM, ordinal: 0, title: { en: 'Week 1 · HTML', pt: 'Semana 1 · HTML' } }],
    lessons: DAYS.map((id, index) => ({ id, unit_id: UNIT, ordinal: index, title: { en: `Day ${index + 1}` } })),
    activities: DAYS.flatMap((lessonId) => activitiesOf(lessonId).map((id) => ({ id, lesson_id: lessonId }))),
  };
}

function finish(lessonId: string, at: string): ProgressRow[] {
  return activitiesOf(lessonId).map((activity_id) => ({ activity_id, status: 'completed', completed_at: at }));
}

function run(progress: ProgressRow[], existing: Award[] = []) {
  return computeAwards({
    ...tree(),
    progress,
    existing: existing.map((award) => ({ achievement_key: award.key, ref_id: award.ref_id, state: award.state })),
    timeZone: TZ,
  });
}

/** Applies awards the way the database does: inserts add a row, updates replace its state. */
function store(rows: Award[], awards: Award[]): Award[] {
  const next = rows.filter((row) => !awards.some((award) => award.key === row.key && award.ref_id === row.ref_id));
  return [...next, ...awards];
}

const keys = (awards: Award[]) => awards.map((award) => `${award.op}:${award.key}`).sort();
const find = (awards: Award[], key: string) => awards.find((award) => award.key === key);

// 15:00 UTC is noon in São Paulo: far from any day or hour boundary.
const noon = (day: string) => `${day}T15:00:00.000Z`;

describe('computeAwards', () => {
  it('awards nothing for a partially completed lesson', () => {
    const progress: ProgressRow[] = [
      { activity_id: 'l1-a', status: 'completed', completed_at: noon('2026-10-05') },
      { activity_id: 'l1-b', status: 'in_progress', completed_at: null },
    ];
    expect(run(progress)).toEqual([]);
  });

  it('opens the passport on the first day', () => {
    const awards = run(finish('l1', noon('2026-10-05')));
    expect(keys(awards)).toEqual(['insert:day_stamp', 'insert:first_stamp', 'insert:trail_pass']);

    const pass = find(awards, 'trail_pass');
    expect(pass?.ref_id).toBe(UNIT);
    expect(pass?.earned_at).toBe(noon('2026-10-05'));
    expect(pass?.state).toMatchObject({
      days_done: 1,
      total_days: 5,
      stamped_lesson_ids: ['l1'],
      tier: 'bronze',
      program_slug: 'itera-v2',
      completed_at: null,
    });
    expect(find(awards, 'day_stamp')).toMatchObject({ ref_id: 'l1', state: { unit_id: UNIT, day: 1 } });
    expect(find(awards, 'first_stamp')?.ref_id).toBe(GLOBAL_REF);
  });

  it('stamps a middle day onto the existing passport', () => {
    const dayOne = finish('l1', noon('2026-10-05'));
    const stored = run(dayOne);
    const awards = run([...dayOne, ...finish('l3', noon('2026-10-08'))], stored);

    expect(keys(awards)).toEqual(['insert:day_stamp', 'update:trail_pass']);
    expect(find(awards, 'day_stamp')).toMatchObject({ ref_id: 'l3', state: { day: 3 } });
    expect(find(awards, 'trail_pass')?.state).toMatchObject({
      days_done: 2,
      stamped_lesson_ids: ['l1', 'l3'],
      tier: 'bronze',
    });
  });

  it('turns the passport gold on the last day', () => {
    const fourDays = DAYS.slice(0, 4).flatMap((id, index) => finish(id, noon(`2026-10-0${index + 1}`)));
    const stored = run(fourDays);
    const awards = run([...fourDays, ...finish('l5', noon('2026-10-20'))], stored);

    expect(keys(awards)).toEqual([
      'insert:day_stamp',
      'insert:program_complete',
      'insert:trail_complete',
      'update:trail_pass',
    ]);
    expect(find(awards, 'trail_pass')?.state).toMatchObject({
      days_done: 5,
      tier: 'gold',
      completed_at: noon('2026-10-20'),
    });
    expect(find(awards, 'trail_complete')).toMatchObject({ ref_id: UNIT, earned_at: noon('2026-10-20') });
    expect(find(awards, 'program_complete')?.ref_id).toBe(PROGRAM);
  });

  it('produces nothing new when re-run on the stored result', () => {
    const progress = DAYS.flatMap((id, index) => finish(id, noon(`2026-10-0${index + 1}`)));
    const stored = run(progress);
    expect(stored.length).toBeGreaterThan(0);
    expect(run(progress, stored)).toEqual([]);
    expect(run(progress)).toEqual(stored);
  });

  it('stays idempotent through an insert followed by a passport update', () => {
    const dayOne = finish('l1', noon('2026-10-05'));
    const twoDays = [...dayOne, ...finish('l2', noon('2026-10-07'))];
    const stored = store(run(dayOne), run(twoDays, run(dayOne)));
    expect(run(twoDays, stored)).toEqual([]);
  });

  it('counts a streak by São Paulo calendar days, not UTC days', () => {
    // Three consecutive local days. In UTC the first two fall on the same date (Oct 6).
    const localStreak = [
      ...finish('l1', '2026-10-06T02:30:00.000Z'), // Oct 5, 23:30 BRT
      ...finish('l2', '2026-10-06T15:00:00.000Z'), // Oct 6, 12:00 BRT
      ...finish('l3', '2026-10-07T12:00:00.000Z'), // Oct 7, 09:00 BRT
    ];
    const streak = find(run(localStreak), 'streak_3');
    expect(streak?.state).toMatchObject({ days: ['2026-10-05', '2026-10-06', '2026-10-07'] });
    expect(streak?.earned_at).toBe('2026-10-07T12:00:00.000Z');

    // Three consecutive UTC dates, but only two local days (the last two share Oct 7 in BRT).
    const utcOnlyStreak = [
      ...finish('l1', '2026-10-06T15:00:00.000Z'), // Oct 6 BRT
      ...finish('l2', '2026-10-07T15:00:00.000Z'), // Oct 7 BRT
      ...finish('l3', '2026-10-08T01:00:00.000Z'), // Oct 7, 22:00 BRT
    ];
    expect(find(run(utcOnlyStreak), 'streak_3')).toBeUndefined();
  });

  it('breaks a streak on a skipped day', () => {
    const progress = [
      ...finish('l1', noon('2026-10-05')),
      ...finish('l2', noon('2026-10-06')),
      ...finish('l3', noon('2026-10-08')),
    ];
    expect(find(run(progress), 'streak_3')).toBeUndefined();
  });

  it('handles two lessons completed in one call', () => {
    const awards = run([...finish('l1', noon('2026-10-05')), ...finish('l2', '2026-10-05T16:00:00.000Z')]);
    expect(keys(awards)).toEqual([
      'insert:day_stamp',
      'insert:day_stamp',
      'insert:first_stamp',
      'insert:trail_pass',
    ]);
    expect(find(awards, 'trail_pass')?.state).toMatchObject({ days_done: 2, stamped_lesson_ids: ['l1', 'l2'] });
    expect(find(awards, 'first_stamp')?.state).toEqual({ lesson_id: 'l1' });
  });

  it('awards the hour medals from the local clock', () => {
    const early = run(finish('l1', '2026-10-05T10:59:00.000Z')); // 07:59 BRT
    expect(find(early, 'early_bird')).toBeDefined();
    expect(find(early, 'night_owl')).toBeUndefined();

    const late = run(finish('l1', '2026-10-06T02:00:00.000Z')); // 23:00 BRT
    expect(find(late, 'night_owl')).toBeDefined();
    expect(find(late, 'early_bird')).toBeUndefined();

    const midday = run(finish('l1', noon('2026-10-05')));
    expect(find(midday, 'early_bird')).toBeUndefined();
    expect(find(midday, 'night_owl')).toBeUndefined();
  });

  it('ignores lessons without counted activities and completed rows without a timestamp', () => {
    const input: AwardsInput = {
      ...tree(),
      lessons: [...tree().lessons, { id: 'empty', unit_id: UNIT, ordinal: 9, title: {} }],
      progress: [
        { activity_id: 'l1-a', status: 'completed', completed_at: noon('2026-10-05') },
        { activity_id: 'l1-b', status: 'completed', completed_at: null },
      ],
      existing: [],
      timeZone: TZ,
    };
    expect(computeAwards(input)).toEqual([]);

    const all = DAYS.flatMap((id, index) => finish(id, noon(`2026-10-0${index + 1}`)));
    const pass = find(computeAwards({ ...input, progress: all }), 'trail_pass');
    expect(pass?.state).toMatchObject({ total_days: 5, tier: 'gold' });
  });
});

describe('localParts', () => {
  it('reads the date and hour in the given zone', () => {
    expect(localParts('2026-10-06T02:30:00.000Z', TZ)).toEqual({ date: '2026-10-05', hour: 23 });
    expect(localParts('2026-10-06T03:00:00.000Z', TZ)).toEqual({ date: '2026-10-06', hour: 0 });
  });
});
