import type { TenantLesson } from '@/types/content';

type LessonGroup = Pick<TenantLesson, 'programSlug' | 'programTitle'> & { lessons: TenantLesson[] };

export function groupLessonsByProgram(lessons: TenantLesson[]): LessonGroup[] {
  const groups = new Map<string, LessonGroup>();
  for (const lesson of lessons) {
    const group = groups.get(lesson.programSlug);
    if (group) group.lessons.push(lesson);
    else {
      groups.set(lesson.programSlug, {
        programSlug: lesson.programSlug,
        programTitle: lesson.programTitle,
        lessons: [lesson],
      });
    }
  }
  return [...groups.values()];
}

export function filterLessons(lessons: TenantLesson[], programSlug: string): TenantLesson[] {
  return programSlug ? lessons.filter((l) => l.programSlug === programSlug) : lessons;
}
