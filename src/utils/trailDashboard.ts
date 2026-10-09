/**
 * Pure logic of the learner dashboard: a trail is a unit, a day is a lesson. Turns the raw
 * program tree plus the learner's progress rows into trails with a state, picks the featured
 * one and draws the dashed path with its day nodes.
 */
import type { I18nText } from '@/types/content';
import type { ProgressRow, SourceProgram, Trail, TrailColor, TrailDay, TrailStatus } from '@/types/trailDashboard';

export { trailPath } from '@/utils/trailPath';

export const TRAIL_COLORS: readonly TrailColor[] = [
  { c: '#0066FF', cl: '#6AA5FF', cs: '#13233F', cd: '#0047B3', ink: '#F4EDE2', ghost: '#1B3C70' },
  { c: '#3FD17F', cl: '#62D996', cs: '#1C3A2A', cd: '#1F8A4F', ink: '#0A0908', ghost: '#1D4F36' },
  { c: '#E07A4A', cl: '#F0A278', cs: '#3A2318', cd: '#A4532D', ink: '#0A0908', ghost: '#5E301D' },
  { c: '#F2C66D', cl: '#F2C66D', cs: '#3A311B', cd: '#B8913A', ink: '#0A0908', ghost: '#5C4A22' },
  { c: '#E0A86F', cl: '#E0A86F', cs: '#3A2A1A', cd: '#A87440', ink: '#0A0908', ghost: '#5A3F25' },
];

export const colorOfTrail = (trail: Pick<Trail, 'colorIndex'>): TrailColor => TRAIL_COLORS[trail.colorIndex % TRAIL_COLORS.length];

const FIRST_PROGRAM_SLUG = 'itera-v2';
const DAY_MS = 86_400_000;
export const WEEKLY_GOAL = 20;

/** "Semana 2 · CSS" -> "CSS"; a title without the separator stays whole. */
export function trailName(title: I18nText): I18nText {
  const out: I18nText = {};
  for (const [lang, text] of Object.entries(title)) {
    if (typeof text !== 'string') continue;
    const at = text.indexOf(' · ');
    out[lang] = at >= 0 ? text.slice(at + 3).trim() : text.trim();
  }
  return out;
}

function programOrder(a: SourceProgram, b: SourceProgram): number {
  const first = Number(b.slug === FIRST_PROGRAM_SLUG) - Number(a.slug === FIRST_PROGRAM_SLUG);
  if (first !== 0) return first;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.slug.localeCompare(b.slug);
}

/** Trails in display order, each with its state. A trail is locked until the previous one of its program is fully done. */
export function buildTrails(programs: readonly SourceProgram[], progress: readonly ProgressRow[]): Trail[] {
  const doneAt = new Map<string, number | null>();
  for (const row of progress) {
    if (row.status !== 'completed') continue;
    const at = row.completedAt ? Date.parse(row.completedAt) : NaN;
    doneAt.set(row.activityId, Number.isNaN(at) ? null : at);
  }

  const trails: Trail[] = [];
  for (const program of [...programs].sort(programOrder)) {
    const units = [...program.units].sort((a, b) => a.ordinal - b.ordinal);
    let previous: Trail | null = null;
    for (const unit of units) {
      const lessons = [...unit.lessons].filter((l) => l.activityIds.length > 0).sort((a, b) => a.ordinal - b.ordinal);
      if (lessons.length === 0) continue;

      let last: number | null = null;
      const days: TrailDay[] = lessons.map((lesson) => {
        const done = lesson.activityIds.filter((id) => doneAt.has(id)).length;
        for (const id of lesson.activityIds) {
          const at = doneAt.get(id);
          if (at != null && (last == null || at > last)) last = at;
        }
        return { id: lesson.id, title: lesson.title, total: lesson.activityIds.length, done, state: 'upcoming' };
      });

      const doneDays = days.filter((d) => d.done >= d.total).length;
      const finished = doneDays === days.length;
      const locked = previous != null && previous.status !== 'done';
      const status: TrailStatus = finished ? 'done' : locked ? 'locked' : days.some((d) => d.done > 0) ? 'in_progress' : 'fresh';

      let currentSet = false;
      for (const day of days) {
        if (day.done >= day.total) day.state = 'done';
        else if (!locked && !currentSet) {
          day.state = 'current';
          currentSet = true;
        }
      }

      const trail: Trail = {
        id: unit.id,
        programSlug: program.slug,
        programTitle: program.title,
        title: unit.title,
        days,
        totalActivities: days.reduce((s, d) => s + d.total, 0),
        doneActivities: days.reduce((s, d) => s + Math.min(d.done, d.total), 0),
        doneDays,
        status,
        lastProgressAt: last,
        unlockedBy: locked && previous ? previous.title : null,
        colorIndex: trails.length,
      };
      trails.push(trail);
      previous = trail;
    }
  }
  return trails;
}

/** The first open, unfinished trail; among those, the one with the most recent progress. */
export function pickFeatured(trails: readonly Trail[]): Trail | null {
  const open = trails.filter((t) => t.status === 'in_progress' || t.status === 'fresh');
  if (open.length === 0) return null;
  let best = open[0];
  for (const t of open) {
    if (t.lastProgressAt != null && (best.lastProgressAt == null || t.lastProgressAt > best.lastProgressAt)) best = t;
  }
  return best;
}

export const currentDayOf = (trail: Trail): TrailDay | null => trail.days.find((d) => d.state === 'current') ?? null;

/** Activities completed in the last 7 days. */
export function weeklyCount(progress: readonly ProgressRow[], now: number = Date.now()): number {
  const since = now - 7 * DAY_MS;
  let count = 0;
  for (const row of progress) {
    if (row.status !== 'completed' || !row.completedAt) continue;
    const at = Date.parse(row.completedAt);
    if (!Number.isNaN(at) && at >= since && at <= now) count += 1;
  }
  return count;
}

/** Progress ticks for the activity bar: how many of `slots` are filled. */
export function barFill(done: number, total: number, slots = 12): number {
  if (total <= 0 || done <= 0) return 0;
  return Math.min(slots, Math.max(1, Math.round((done / total) * slots)));
}

