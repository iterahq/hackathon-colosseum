import { localParts } from './awards.ts';

export const WEEKLY_GOAL = 20;
const WINDOW_MS = 7 * 86_400_000;

export interface IsoWeek {
  year: number;
  week: number;
}

/** The ISO-8601 week of a calendar date (`YYYY-MM-DD`): weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeekOf(date: string): IsoWeek {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  return { year, week: Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

export function weekLabel({ year, week }: IsoWeek): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** A stable uuid per ISO week ("week" in hex, then year and week), so one medal exists per learner and week. */
export function weekRefId({ year, week }: IsoWeek): string {
  return `7765656b-${String(year).padStart(4, '0')}-40${String(week).padStart(2, '0')}-8000-000000000000`;
}

export interface WeeklyGoalHit {
  ref_id: string;
  week: string;
  /** The completion that brought the trailing seven days to the goal. */
  earned_at: string;
  count: number;
}

/**
 * The weeks in which the learner reached the weekly goal: at some completion,
 * the activities completed in the seven days ending at it numbered at least
 * `goal` (the dashboard's count). At most one hit per ISO week of `timeZone`.
 */
export function weeklyGoalHits(completedAt: readonly string[], timeZone: string, goal = WEEKLY_GOAL): WeeklyGoalHit[] {
  const times = completedAt
    .map((iso) => new Date(iso).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  const hits: WeeklyGoalHit[] = [];
  const seen = new Set<string>();
  let oldest = 0;
  for (let index = 0; index < times.length; index += 1) {
    while (times[index] - times[oldest] > WINDOW_MS) oldest += 1;
    const count = index - oldest + 1;
    if (count < goal) continue;
    const earnedAt = new Date(times[index]).toISOString();
    const week = isoWeekOf(localParts(earnedAt, timeZone).date);
    const label = weekLabel(week);
    if (seen.has(label)) continue;
    seen.add(label);
    hits.push({ ref_id: weekRefId(week), week: label, earned_at: earnedAt, count });
  }
  return hits;
}
