/** Pure view-model of the video courses: progress, state, featured pick, filters, durations. */
import type { VideoCourse, VideoCourseFilter, VideoCourseState, VideoProgress } from '@/types/videoCourses';

export const VIDEO_FILTERS: readonly VideoCourseFilter[] = ['all', 'in_progress', 'new', 'done'];

export interface CourseStats {
  total: number;
  watched: number;
  durationSeconds: number;
  state: VideoCourseState;
  lastWatchedAt: number | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 349 -> "5:49"; an hour or more -> "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 5400 -> "1h 30min"; under an hour -> "12min"; never "0min" for a non-empty course. */
export function formatTotal(seconds: number): string {
  const minutes = Math.max(seconds > 0 ? 1 : 0, Math.round(seconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function courseStats(course: VideoCourse, progress: VideoProgress): CourseStats {
  let watched = 0;
  let last: number | null = null;
  for (const lesson of course.lessons) {
    const at = progress.get(lesson.id);
    if (at === undefined) continue;
    watched += 1;
    if (last === null || at > last) last = at;
  }
  const total = course.lessons.length;
  const state: VideoCourseState = total > 0 && watched >= total ? 'done' : watched > 0 ? 'in_progress' : 'new';
  return { total, watched, durationSeconds: course.lessons.reduce((n, l) => n + l.durationSeconds, 0), state, lastWatchedAt: last };
}

export const sortCourses = (courses: readonly VideoCourse[]): VideoCourse[] =>
  [...courses].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

/** The course the learner is in the middle of (most recently watched), else the first by position. */
export function pickFeatured(courses: readonly VideoCourse[], progress: VideoProgress): VideoCourse | null {
  const ordered = sortCourses(courses);
  let best: VideoCourse | null = null;
  let bestAt = -1;
  for (const course of ordered) {
    const stats = courseStats(course, progress);
    if (stats.state === 'in_progress' && stats.lastWatchedAt !== null && stats.lastWatchedAt > bestAt) {
      best = course;
      bestAt = stats.lastWatchedAt;
    }
  }
  return best ?? ordered.find((c) => courseStats(c, progress).state === 'new') ?? ordered[0] ?? null;
}

export function filterCourses(courses: readonly VideoCourse[], progress: VideoProgress, filter: VideoCourseFilter): VideoCourse[] {
  return filter === 'all' ? [...courses] : courses.filter((c) => courseStats(c, progress).state === filter);
}

export function countByFilter(courses: readonly VideoCourse[], progress: VideoProgress): Record<VideoCourseFilter, number> {
  const counts: Record<VideoCourseFilter, number> = { all: courses.length, in_progress: 0, new: 0, done: 0 };
  for (const course of courses) counts[courseStats(course, progress).state] += 1;
  return counts;
}

/** The video to open without a `?v=`: the first unwatched one, else the first. */
export function defaultLessonId(course: VideoCourse, progress: VideoProgress): string | null {
  return (course.lessons.find((l) => !progress.has(l.id)) ?? course.lessons[0])?.id ?? null;
}

/** The lesson after `lessonId`, preferring the next unwatched one; null at the end of the playlist. */
export function nextLessonId(course: VideoCourse, lessonId: string, progress: VideoProgress): string | null {
  const at = course.lessons.findIndex((l) => l.id === lessonId);
  if (at < 0) return null;
  const after = course.lessons.slice(at + 1);
  return (after.find((l) => !progress.has(l.id)) ?? after[0])?.id ?? null;
}

/** "Tainan Fidelis" -> "TF"; one word -> its first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const teacherCourseCount = (courses: readonly VideoCourse[], teacher: string): number => courses.filter((c) => c.teacherName === teacher).length;

/** Three-letter mono glyph used when a thumbnail cannot load. */
export const thumbGlyph = (title: string): string =>
  title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || '···';

/** The embeddable URL with the player chrome kept minimal. */
export const embedUrl = (videoUrl: string): string => `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}rel=0&modestbranding=1`;
