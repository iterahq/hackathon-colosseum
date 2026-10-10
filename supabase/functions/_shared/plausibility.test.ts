import { describe, expect, it } from 'vitest';
import { computeAwards, dayPendingReview, type AwardsInput, type ExistingAward, type ProgressRow } from './awards';
import { MIN_LESSON_SPAN_MS, lessonPlausibility, minLessonSpanMs, type LessonCompletion } from './plausibility';

const at = (base: string, seconds: number) => new Date(new Date(base).getTime() + seconds * 1000).toISOString();
const completion = (index: number, completedAt: string, patch: Partial<LessonCompletion> = {}): LessonCompletion => ({
  activityId: `a${index}`,
  completedAt,
  writtenByClient: true,
  hasPassedResult: true,
  ...patch,
});

describe('minLessonSpanMs', () => {
  it('is 20 s from 15 activities up and scales down for shorter lessons', () => {
    expect(MIN_LESSON_SPAN_MS).toBe(20_000);
    expect(minLessonSpanMs(15)).toBe(20_000);
    expect(minLessonSpanMs(16)).toBe(20_000);
    expect(minLessonSpanMs(40)).toBe(20_000);
    expect(minLessonSpanMs(2)).toBe(1_429);
    expect(minLessonSpanMs(8)).toBe(10_003);
    expect(minLessonSpanMs(1)).toBe(0);
    expect(minLessonSpanMs(0)).toBe(0);
  });
});

describe('lessonPlausibility', () => {
  const START = '2026-10-10T12:00:00.000Z';
  const burst = (count: number, stepSeconds: number, patch: Partial<LessonCompletion> = {}) =>
    Array.from({ length: count }, (_, index) => completion(index, at(START, index * stepSeconds), patch));

  it('refuses a 16-activity day recorded by the client in one burst', () => {
    expect(lessonPlausibility(burst(16, 0))).toBe('too_fast');
    expect(lessonPlausibility(burst(16, 1))).toBe('too_fast');
    expect(lessonPlausibility(burst(16, 1.3))).toBe('too_fast');
  });

  it('accepts the same day once it spans the floor, attempts included', () => {
    expect(lessonPlausibility(burst(16, 1.4))).toBeNull();
    expect(lessonPlausibility(burst(16, 30))).toBeNull();
  });

  it('refuses a client-recorded completion that has no passed attempt', () => {
    const day = burst(16, 30);
    day[7] = { ...day[7], hasPassedResult: false };
    expect(lessonPlausibility(day)).toBe('missing_results');
  });

  it('does not judge a day no client recorded (operator seeding, rows older than the guard)', () => {
    expect(lessonPlausibility(burst(16, 0, { writtenByClient: false, hasPassedResult: false }))).toBeNull();
  });

  it('does not ask an operator-recorded completion for an attempt', () => {
    const day = burst(16, 30, { writtenByClient: false, hasPassedResult: false });
    day[15] = { ...day[15], writtenByClient: true, hasPassedResult: true };
    expect(lessonPlausibility(day)).toBeNull();
  });

  it('treats an unreadable date as too fast', () => {
    const day = burst(16, 30);
    day[0] = { ...day[0], completedAt: 'not a date' };
    expect(lessonPlausibility(day)).toBe('too_fast');
  });
});

describe('the floor inside the awards', () => {
  const TZ = 'America/Sao_Paulo';
  const DAYS = ['d1', 'd2', 'd3', 'd4', 'd5'];
  const SIZES: Record<string, number> = { d1: 18, d2: 16, d3: 15, d4: 16, d5: 16 };
  const activitiesOf = (lesson: string) => Array.from({ length: SIZES[lesson] }, (_, index) => `${lesson}-${String(index).padStart(2, '0')}`);
  const tree: Pick<AwardsInput, 'programs' | 'units' | 'lessons' | 'activities'> = {
    programs: [{ id: 'p', slug: 'itera-v2', title: { en: 'Itera v2' } }],
    units: [{ id: 'u', program_id: 'p', ordinal: 0, title: { en: 'HTML' } }],
    lessons: DAYS.map((id, index) => ({ id, unit_id: 'u', ordinal: index, title: { en: `Day ${index + 1}` } })),
    activities: DAYS.flatMap((lesson) => activitiesOf(lesson).map((id) => ({ id, lesson_id: lesson }))),
  };
  const seeded = (lesson: string, day: string, upTo = SIZES[lesson]): ProgressRow[] =>
    activitiesOf(lesson)
      .slice(0, upTo)
      .map((activity_id, index) => ({ activity_id, status: 'completed', completed_at: at(`${day}T21:01:00.000Z`, index * 60), written_by_client: false }));
  const byClient = (ids: string[], start: string, stepSeconds: number): ProgressRow[] =>
    ids.map((activity_id, index) => ({ activity_id, status: 'completed', completed_at: at(start, index * stepSeconds), written_by_client: true }));
  const input = (progress: ProgressRow[], existing: ExistingAward[], passedActivityIds: string[] = []): AwardsInput => ({ ...tree, progress, existing, passedActivityIds, timeZone: TZ });
  // The weekly goal counts activities, not days, and is not part of the floor: left out of these expectations.
  const core = (awards: ReturnType<typeof computeAwards>) => awards.filter((award) => award.key !== 'weekly_goal');
  const keys = (awards: ReturnType<typeof computeAwards>) => core(awards).map((award) => `${award.op}:${award.key}`).sort();

  // The owner's account before the recording: days 1-4 seeded by an operator with backdated times and
  // already stamped, day 5 with 14 of 16 activities seeded the day before.
  const fourDays = [...seeded('d1', '2026-10-05'), ...seeded('d2', '2026-10-06'), ...seeded('d3', '2026-10-07'), ...seeded('d4', '2026-10-08')];
  const stampedFour: ExistingAward[] = [
    { achievement_key: 'trail_pass', ref_id: 'u', state: { unit_id: 'u', program_id: 'p', program_slug: 'itera-v2', trail_title: { en: 'HTML' }, days_done: 4, total_days: 5, stamped_lesson_ids: ['d1', 'd2', 'd3', 'd4'], stamped_days: [1, 2, 3, 4], tier: 'bronze', completed_at: null } },
    ...['d1', 'd2', 'd3', 'd4'].map((ref_id) => ({ achievement_key: 'day_stamp', ref_id, state: {} })),
    { achievement_key: 'first_stamp', ref_id: '00000000-0000-0000-0000-000000000000', state: {} },
    { achievement_key: 'streak_3', ref_id: '00000000-0000-0000-0000-000000000000', state: {} },
  ];
  const lastTwo = activitiesOf('d5').slice(14);

  it('the demo: the last TWO activities of day 5 done live, seconds apart, still earn the stamp and the gold', () => {
    const progress = [...fourDays, ...seeded('d5', '2026-10-09', 14), ...byClient(lastTwo, '2026-10-10T18:00:00.000Z', 6)];
    const live = input(progress, stampedFour, lastTwo);
    expect(dayPendingReview(live, 'd5')).toBeNull();
    const awards = computeAwards(live);
    expect(keys(awards)).toEqual(['insert:day_stamp', 'insert:program_complete', 'insert:trail_complete', 'update:trail_pass']);
    expect(awards.find((award) => award.key === 'day_stamp')).toMatchObject({ ref_id: 'd5', state: { day: 5, total_days: 5 } });
    expect(awards.find((award) => award.key === 'trail_pass')?.state).toMatchObject({ days_done: 5, total_days: 5, tier: 'gold', stamped_days: [1, 2, 3, 4, 5] });
  });

  it('the demo, if the attempt of a live activity was not saved: nothing awarded, a neutral notice, nothing revoked', () => {
    const progress = [...fourDays, ...seeded('d5', '2026-10-09', 14), ...byClient(lastTwo, '2026-10-10T18:00:00.000Z', 6)];
    const live = input(progress, stampedFour, [lastTwo[0]]);
    expect(dayPendingReview(live, 'd5')).toEqual({ lesson_id: 'd5', reason: 'missing_results' });
    expect(core(computeAwards(live))).toEqual([]);
  });

  it('never revokes: seeded days that were stamped stay, whatever their timestamps look like', () => {
    const sameInstant = fourDays.map((row) => ({ ...row, completed_at: '2026-10-08T21:00:00.000Z', written_by_client: true }));
    expect(core(computeAwards(input(sameInstant, stampedFour)))).toEqual([]);
    expect(dayPendingReview(input(sameInstant, stampedFour), null)).toBeNull();
  });

  it('a whole day recorded by the client in one burst awards nothing and is reported as pending', () => {
    const ids = activitiesOf('d1');
    const fake = input(byClient(ids, '2026-10-10T18:00:00.000Z', 0.2), [], ids);
    expect(core(computeAwards(fake))).toEqual([]);
    expect(dayPendingReview(fake, 'd1')).toEqual({ lesson_id: 'd1', reason: 'too_fast' });
    expect(dayPendingReview(fake, null)).toEqual({ lesson_id: 'd1', reason: 'too_fast' });
    expect(dayPendingReview(fake, 'd2')).toBeNull();
  });

  it('the same day played at a human pace, with its attempts, is stamped', () => {
    const ids = activitiesOf('d1');
    const real = input(byClient(ids, '2026-10-10T18:00:00.000Z', 25), [], ids);
    expect(dayPendingReview(real, 'd1')).toBeNull();
    expect(keys(computeAwards(real))).toEqual(['insert:day_stamp', 'insert:first_stamp', 'insert:trail_pass']);
  });

  it('a pending day does not hold back the other days', () => {
    const burstDay = byClient(activitiesOf('d2'), '2026-10-10T18:00:00.000Z', 0);
    const mixed = input([...seeded('d1', '2026-10-05'), ...burstDay], [], activitiesOf('d2'));
    expect(keys(computeAwards(mixed))).toEqual(['insert:day_stamp', 'insert:first_stamp', 'insert:trail_pass']);
    expect(computeAwards(mixed).find((award) => award.key === 'trail_pass')?.state).toMatchObject({ days_done: 1, stamped_lesson_ids: ['d1'] });
    expect(dayPendingReview(mixed, null)).toEqual({ lesson_id: 'd2', reason: 'too_fast' });
  });
});
