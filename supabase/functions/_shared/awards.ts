import { lessonPlausibility, minLessonSpanMs, type ReviewReason } from './plausibility.ts';
import { combineProofs, lessonProof, type LessonProof, type PassingAttempt } from './proof.ts';
import { WEEKLY_GOAL, weeklyGoalHits } from './weekly-goal.ts';

export const GLOBAL_REF = '00000000-0000-0000-0000-000000000000';

export type AchievementKey =
  | 'trail_pass'
  | 'day_stamp'
  | 'trail_complete'
  | 'first_stamp'
  | 'streak_3'
  | 'streak_7'
  | 'program_complete'
  | 'early_bird'
  | 'night_owl'
  | 'friend_brought'
  | 'invited'
  | 'weekly_goal';

export type Tier = 'bronze' | 'silver' | 'gold';
export type I18nText = Record<string, string>;

export interface ProgramNode {
  id: string;
  slug: string;
  title: I18nText;
}

export interface UnitNode {
  id: string;
  program_id: string;
  ordinal: number;
  title: I18nText;
}

export interface LessonNode {
  id: string;
  unit_id: string;
  ordinal: number;
  title: I18nText;
}

export interface ActivityNode {
  id: string;
  lesson_id: string;
}

export interface ProgressRow {
  activity_id: string;
  status: string;
  completed_at: string | null;
  /** The completion was recorded by a client role (migration 0134). Absent or false: not judged by the floor. */
  written_by_client?: boolean | null;
}

export interface ExistingAward {
  achievement_key: string;
  ref_id: string;
  state: Record<string, unknown>;
}

export interface AwardsInput {
  programs: ProgramNode[];
  units: UnitNode[];
  lessons: LessonNode[];
  /** Only the activities that count towards completing a lesson. */
  activities: ActivityNode[];
  progress: ProgressRow[];
  /** Activities the learner has a passed attempt for (`activity_results`). Read by the plausibility floor. */
  passedActivityIds?: Iterable<string>;
  /** The first passing attempt the `grade` function recorded per activity (`graded_attempts`). */
  attempts?: ReadonlyMap<string, PassingAttempt>;
  /**
   * Since this instant a completion is written by the server only (migration 0191). A client-recorded
   * completion from before it is legacy; one from after it, without an attempt, is not a completion.
   */
  proofCutoff?: string | null;
  existing: ExistingAward[];
  /** IANA zone that decides calendar days and hours, e.g. `America/Sao_Paulo`. */
  timeZone: string;
}

export interface PassportState {
  unit_id: string;
  program_id: string;
  program_slug: string;
  trail_title: I18nText;
  days_done: number;
  total_days: number;
  stamped_lesson_ids: string[];
  /** 1-based positions of the stamped lessons inside the trail. */
  stamped_days: number[];
  tier: Tier;
  completed_at: string | null;
  /** What stands behind the stamped days, once any of them has server-recorded attempts. */
  proof?: LessonProof;
}

export interface Award {
  key: AchievementKey;
  ref_id: string;
  earned_at: string;
  state: Record<string, unknown>;
  /** `update`: the row already exists and only its `state` moved (a passport gaining a stamp). */
  op: 'insert' | 'update';
}

interface CompletedLesson {
  lesson: LessonNode;
  completedAt: string;
}

const awardId = (key: string, refId: string) => `${key}:${refId}`;

const byOrdinalThenId = <T extends { ordinal: number; id: string }>(a: T, b: T) =>
  a.ordinal - b.ordinal || a.id.localeCompare(b.id);

const byTimeThenId = (a: CompletedLesson, b: CompletedLesson) =>
  a.completedAt.localeCompare(b.completedAt) || a.lesson.id.localeCompare(b.lesson.id);

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function localParts(iso: string, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function completedAtOf(progress: AwardsInput['progress']): Map<string, string> {
  const completedAtByActivity = new Map<string, string>();
  for (const row of progress) {
    if (row.status === 'completed' && row.completed_at) {
      completedAtByActivity.set(row.activity_id, new Date(row.completed_at).toISOString());
    }
  }
  return completedAtByActivity;
}

export interface DayIncomplete {
  lesson_id: string;
  done: number;
  total: number;
}

/** `null` when the lesson is complete or has no counted activities; otherwise how far the learner got. */
export function dayIncomplete(input: Pick<AwardsInput, 'activities' | 'progress'>, lessonId: string): DayIncomplete | null {
  const counted = input.activities.filter((activity) => activity.lesson_id === lessonId);
  if (counted.length === 0) return null;
  const completedAt = completedAtOf(input.progress);
  const done = counted.filter((activity) => completedAt.has(activity.id)).length;
  return done === counted.length ? null : { lesson_id: lessonId, done, total: counted.length };
}

export interface PendingReview {
  lesson_id: string;
  reason: ReviewReason;
  /** `too_fast` only: the least time, in seconds, between the first and the last answer of the day. */
  min_seconds?: number;
  /** `too_fast` only: what lifts the hold. Nobody reviews by hand: passing any one exercise of the day again does it. */
  clears_by?: 'redo_one_activity';
}

type ReviewInput = Pick<AwardsInput, 'lessons' | 'activities' | 'progress' | 'passedActivityIds' | 'attempts' | 'proofCutoff' | 'existing'>;

/**
 * A lesson is done when every counted activity is completed; it happened when
 * the last one was. A lesson that fails the plausibility floor is `pending`
 * instead and awards nothing, unless its stamp was already awarded: a stored
 * row is never taken back.
 */
function reviewLessons(input: ReviewInput): { done: CompletedLesson[]; pending: PendingReview[] } {
  const completedAtByActivity = completedAtOf(input.progress);
  const byClient = new Set(input.progress.filter((row) => row.written_by_client === true).map((row) => row.activity_id));
  const passed = new Set(input.passedActivityIds ?? []);
  const attempts = input.attempts ?? new Map<string, PassingAttempt>();
  const cutoff = input.proofCutoff ? new Date(input.proofCutoff).getTime() : Number.NaN;
  const stamped = new Set(input.existing.filter((row) => row.achievement_key === 'day_stamp').map((row) => row.ref_id));
  const activitiesByLesson = groupBy(input.activities, (activity) => activity.lesson_id);
  const done: CompletedLesson[] = [];
  const pending: PendingReview[] = [];
  for (const lesson of input.lessons) {
    const activities = activitiesByLesson.get(lesson.id) ?? [];
    if (activities.length === 0) continue;
    const times = activities.map((activity) => completedAtByActivity.get(activity.id));
    if (times.some((time) => time === undefined)) continue;
    if (!stamped.has(lesson.id)) {
      const unverified = activities.some(
        (activity, index) => byClient.has(activity.id) && !attempts.has(activity.id) && new Date(times[index] as string).getTime() >= cutoff,
      );
      if (unverified) {
        pending.push({ lesson_id: lesson.id, reason: 'unverified' });
        continue;
      }
      // A completion the server recorded after grading is judged by the floor like one a client recorded.
      const completions = activities.map((activity, index) => ({
        activityId: activity.id,
        completedAt: times[index] as string,
        writtenByClient: byClient.has(activity.id) || attempts.has(activity.id),
        hasPassedResult: passed.has(activity.id) || attempts.has(activity.id),
      }));
      let reason = lessonPlausibility(completions);
      // A day held for its speed is not held for good: an exercise passed again later counts at the time of that pass.
      if (reason === 'too_fast') {
        reason = lessonPlausibility(
          completions.map((completion) => ({ ...completion, completedAt: attempts.get(completion.activityId)?.last_passed_at ?? completion.completedAt })),
        );
      }
      if (reason) {
        pending.push(
          reason === 'too_fast'
            ? { lesson_id: lesson.id, reason, min_seconds: Math.ceil(minLessonSpanMs(activities.length) / 1000), clears_by: 'redo_one_activity' }
            : { lesson_id: lesson.id, reason },
        );
        continue;
      }
    }
    done.push({ lesson, completedAt: (times as string[]).sort().at(-1) as string });
  }
  return { done: done.sort(byTimeThenId), pending };
}

/**
 * The fully completed lesson that awards nothing yet, for a neutral notice:
 * the named lesson when it is one, else the first such lesson. `null` when none.
 */
export function dayPendingReview(input: ReviewInput, lessonId: string | null): PendingReview | null {
  const { pending } = reviewLessons(input);
  if (lessonId) return pending.find((entry) => entry.lesson_id === lessonId) ?? null;
  return pending[0] ?? null;
}

/** The lesson that closed the first run of `length` consecutive local days, if any. */
function streakClosedBy(done: CompletedLesson[], length: number, timeZone: string) {
  const firstOfDay = new Map<string, CompletedLesson>();
  for (const entry of done) {
    const { date } = localParts(entry.completedAt, timeZone);
    if (!firstOfDay.has(date)) firstOfDay.set(date, entry);
  }
  const dates = [...firstOfDay.keys()].sort();
  let run: string[] = [];
  for (const date of dates) {
    run = run.length > 0 && nextDate(run[run.length - 1]) === date ? [...run, date] : [date];
    if (run.length === length) return { closing: firstOfDay.get(date) as CompletedLesson, days: run };
  }
  return null;
}

/** Key order is not a difference: a stored `jsonb` object comes back with its keys reordered. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

/**
 * Derives every award the learner is entitled to from their progress and returns
 * only what the stored rows are missing. Pure: same input, same output.
 */
export function computeAwards(input: AwardsInput): Award[] {
  const { done } = reviewLessons(input);
  const existing = new Map(input.existing.map((row) => [awardId(row.achievement_key, row.ref_id), row]));
  // The weekly goal counts activities, not whole days: it can land before any lesson is complete.
  const weekly: Award[] = weeklyGoalHits([...completedAtOf(input.progress).values()], input.timeZone)
    .filter((hit) => !existing.has(awardId('weekly_goal', hit.ref_id)))
    .map((hit) => ({
      key: 'weekly_goal',
      ref_id: hit.ref_id,
      earned_at: hit.earned_at,
      state: { week: hit.week, count: hit.count, goal: WEEKLY_GOAL, time_zone: input.timeZone },
      op: 'insert',
    }));
  if (done.length === 0) return weekly;

  const programById = new Map(input.programs.map((program) => [program.id, program]));
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const lessonsByUnit = groupBy(input.lessons, (lesson) => lesson.unit_id);
  const unitsByProgram = groupBy(input.units, (unit) => unit.program_id);
  const activityLessonIds = new Set(input.activities.map((activity) => activity.lesson_id));
  const doneByUnit = groupBy(done, (entry) => entry.lesson.unit_id);
  const activitiesByLesson = groupBy(input.activities, (activity) => activity.lesson_id);
  const attempts = input.attempts ?? new Map<string, PassingAttempt>();
  const proofOf = (lessonId: string) => lessonProof((activitiesByLesson.get(lessonId) ?? []).map((activity) => activity.id), attempts);

  const entitled: Omit<Award, 'op'>[] = [];
  const completedUnits = new Map<string, string>();

  for (const [unitId, unitDone] of doneByUnit) {
    const unit = unitById.get(unitId);
    const program = unit && programById.get(unit.program_id);
    if (!unit || !program) continue;

    const countedLessons = (lessonsByUnit.get(unitId) ?? [])
      .filter((lesson) => activityLessonIds.has(lesson.id))
      .sort(byOrdinalThenId);
    const dayOf = new Map(countedLessons.map((lesson, index) => [lesson.id, index + 1]));
    const doneIds = new Set(unitDone.map((entry) => entry.lesson.id));
    const stampedLessons = countedLessons.filter((lesson) => doneIds.has(lesson.id));
    const isComplete = unitDone.length === countedLessons.length;
    const completedAt = isComplete ? unitDone[unitDone.length - 1].completedAt : null;
    if (completedAt) completedUnits.set(unitId, completedAt);

    const passport: PassportState = {
      unit_id: unit.id,
      program_id: program.id,
      program_slug: program.slug,
      trail_title: unit.title,
      days_done: unitDone.length,
      total_days: countedLessons.length,
      stamped_lesson_ids: stampedLessons.map((lesson) => lesson.id),
      stamped_days: stampedLessons.map((lesson) => dayOf.get(lesson.id) as number),
      tier: isComplete ? 'gold' : 'bronze',
      completed_at: completedAt,
    };
    const trailProof = combineProofs(stampedLessons.flatMap((lesson) => proofOf(lesson.id) ?? []));
    if (trailProof) passport.proof = trailProof;
    entitled.push({ key: 'trail_pass', ref_id: unit.id, earned_at: unitDone[0].completedAt, state: { ...passport } });

    for (const entry of unitDone) {
      const proof = proofOf(entry.lesson.id);
      entitled.push({
        key: 'day_stamp',
        ref_id: entry.lesson.id,
        earned_at: entry.completedAt,
        state: {
          unit_id: unit.id,
          day: dayOf.get(entry.lesson.id),
          total_days: countedLessons.length,
          lesson_title: entry.lesson.title,
          trail_title: unit.title,
          ...(proof ? { proof } : {}),
        },
      });
    }

    if (completedAt) {
      entitled.push({
        key: 'trail_complete',
        ref_id: unit.id,
        earned_at: completedAt,
        state: {
          unit_id: unit.id,
          program_slug: program.slug,
          trail_title: unit.title,
          total_days: countedLessons.length,
        },
      });
    }
  }

  const first = done[0];
  entitled.push({
    key: 'first_stamp',
    ref_id: GLOBAL_REF,
    earned_at: first.completedAt,
    state: { lesson_id: first.lesson.id },
  });

  for (const [key, length] of [['streak_3', 3], ['streak_7', 7]] as const) {
    const streak = streakClosedBy(done, length, input.timeZone);
    if (streak) {
      entitled.push({
        key,
        ref_id: GLOBAL_REF,
        earned_at: streak.closing.completedAt,
        state: { days: streak.days, time_zone: input.timeZone },
      });
    }
  }

  for (const program of input.programs) {
    const countedUnits = (unitsByProgram.get(program.id) ?? []).filter((unit) =>
      (lessonsByUnit.get(unit.id) ?? []).some((lesson) => activityLessonIds.has(lesson.id)),
    );
    if (countedUnits.length === 0 || !countedUnits.every((unit) => completedUnits.has(unit.id))) continue;
    const finishedAt = countedUnits.map((unit) => completedUnits.get(unit.id) as string).sort().at(-1) as string;
    entitled.push({
      key: 'program_complete',
      ref_id: program.id,
      earned_at: finishedAt,
      state: { program_slug: program.slug, program_title: program.title, total_trails: countedUnits.length },
    });
  }

  const hourly: Array<[AchievementKey, (hour: number) => boolean]> = [
    ['early_bird', (hour) => hour < 8],
    ['night_owl', (hour) => hour >= 23],
  ];
  for (const [key, matches] of hourly) {
    const hit = done.find((entry) => matches(localParts(entry.completedAt, input.timeZone).hour));
    if (hit) {
      entitled.push({
        key,
        ref_id: GLOBAL_REF,
        earned_at: hit.completedAt,
        state: { lesson_id: hit.lesson.id, time_zone: input.timeZone },
      });
    }
  }

  const awards: Award[] = [];
  for (const award of entitled) {
    const stored = existing.get(awardId(award.key, award.ref_id));
    if (!stored) {
      awards.push({ ...award, op: 'insert' });
    } else if (award.key === 'trail_pass') {
      const moved = Object.entries(award.state).some(([field, value]) => !sameJson(stored.state[field], value));
      if (moved) awards.push({ ...award, op: 'update' });
    }
  }
  return [...awards, ...weekly];
}
