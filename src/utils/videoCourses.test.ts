import { describe, expect, it } from 'vitest';
import type { VideoCourse } from '@/types/videoCourses';
import { countByFilter, courseStats, courseThumbnail, defaultLessonId, embedUrl, filterCourses, uniqueCourses, formatClock, formatTotal, initials, nextLessonId, pickFeatured, teacherCourseCount, thumbGlyph } from '@/utils/videoCourses';

const course = (slug: string, position: number, lessonIds: string[], teacherName = 'Ana Lima'): VideoCourse => ({
  id: slug,
  slug,
  title: slug,
  description: '',
  thumbnailUrl: null,
  teacherName,
  teacherAvatarUrl: null,
  position,
  lessons: lessonIds.map((id, i) => ({ id, courseId: slug, title: id, description: '', videoUrl: `https://www.youtube.com/embed/${id}`, durationSeconds: 60, position: i + 1 })),
});

const a = course('a', 1, ['a1', 'a2']);
const b = course('b', 2, ['b1', 'b2', 'b3'], 'Bo');
const c = course('c', 3, ['c1']);
const progress = new Map([['b1', 100], ['c1', 50], ['a1', 10]]);

describe('durations', () => {
  it('formats a clock', () => {
    expect(formatClock(349)).toBe('5:49');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(-4)).toBe('0:00');
  });
  it('formats a course total', () => {
    expect(formatTotal(5400)).toBe('1h 30min');
    expect(formatTotal(720)).toBe('12min');
    expect(formatTotal(10)).toBe('1min');
    expect(formatTotal(0)).toBe('0min');
  });
});

describe('courseStats', () => {
  it('derives state, counts and the last watch time', () => {
    expect(courseStats(a, progress)).toMatchObject({ total: 2, watched: 1, state: 'in_progress', lastWatchedAt: 10, durationSeconds: 120 });
    expect(courseStats(c, progress).state).toBe('done');
    expect(courseStats(a, new Map()).state).toBe('new');
    expect(courseStats(course('e', 9, []), new Map()).state).toBe('new');
  });
});

describe('pickFeatured', () => {
  it('prefers the most recently watched in-progress course', () => {
    expect(pickFeatured([a, b, c], progress)?.slug).toBe('b');
  });
  it('falls back to the first unstarted, then the first', () => {
    expect(pickFeatured([b, a], new Map())?.slug).toBe('a');
    expect(pickFeatured([c], progress)?.slug).toBe('c');
    expect(pickFeatured([], progress)).toBeNull();
  });
});

describe('filters', () => {
  it('counts and filters by state', () => {
    expect(countByFilter([a, b, c], progress)).toEqual({ all: 3, in_progress: 2, new: 0, done: 1 });
    expect(filterCourses([a, b, c], progress, 'done').map((x) => x.slug)).toEqual(['c']);
    expect(filterCourses([a, b, c], progress, 'all')).toHaveLength(3);
  });
});

describe('playlist navigation', () => {
  it('opens the first unwatched video, else the first', () => {
    expect(defaultLessonId(b, progress)).toBe('b2');
    expect(defaultLessonId(c, progress)).toBe('c1');
    expect(defaultLessonId(course('e', 1, []), progress)).toBeNull();
  });
  it('finds the next video, skipping watched ones, null at an unknown id', () => {
    expect(nextLessonId(b, 'b1', new Map([['b1', 1], ['b2', 1]]))).toBe('b3');
    expect(nextLessonId(b, 'b1', new Map())).toBe('b2');
    expect(nextLessonId(b, 'b3', new Map())).toBeNull();
    expect(nextLessonId(b, 'zz', new Map())).toBeNull();
  });
});

describe('labels', () => {
  it('builds initials, glyphs, teacher counts and embed urls', () => {
    expect(initials('Tainan Fidelis')).toBe('TF');
    expect(initials('Alexandre')).toBe('AL');
    expect(initials('')).toBe('··');
    expect(thumbGlyph('Ação rápida')).toBe('ACA');
    expect(teacherCourseCount([a, b, c], 'Ana Lima')).toBe(2);
    expect(embedUrl('https://www.youtube.com/embed/x')).toBe('https://www.youtube.com/embed/x?rel=0&modestbranding=1');
  });
});

describe('uniqueCourses', () => {
  it('drops a repeated id or slug and keeps the first', () => {
    const a = course('a', 1, ['x']);
    const list = [a, { ...a }, { ...course('b', 2, ['y']), id: 'a' }, course('c', 3, ['z'])];
    expect(uniqueCourses(list).map((c) => c.slug)).toEqual(['a', 'c']);
  });
});

describe('courseThumbnail', () => {
  const lesson = (videoUrl: string, position: number) => ({ videoUrl, position });
  it('prefers the course thumbnail', () => {
    expect(courseThumbnail({ thumbnailUrl: 'https://x/t.png', lessons: [lesson('https://www.youtube.com/embed/abcdefghijk', 1)] })).toBe('https://x/t.png');
  });
  it('derives the YouTube thumbnail of the first lesson', () => {
    expect(courseThumbnail({ thumbnailUrl: null, lessons: [lesson('https://youtu.be/zzzzzzzzzzz', 2), lesson('https://www.youtube.com/embed/abcdefghijk?rel=0', 1)] })).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  });
  it('is null without any usable video', () => {
    expect(courseThumbnail({ thumbnailUrl: null, lessons: [lesson('https://vimeo.com/1', 1)] })).toBeNull();
    expect(courseThumbnail({ thumbnailUrl: null, lessons: [] })).toBeNull();
  });
});
