import { describe, it, expect } from 'vitest';
import type { TenantLesson } from '@/types/content';
import { filterLessons, groupLessonsByProgram } from './startClassLessons';

const lesson = (id: string, programSlug: string): TenantLesson => ({
  id,
  title: { pt: id, en: id },
  programId: `id-${programSlug}`,
  programSlug,
  programTitle: { pt: programSlug, en: programSlug },
});

const all = [lesson('l1', 'a'), lesson('l2', 'a'), lesson('l3', 'b')];

describe('startClassLessons', () => {
  it('keeps every lesson when no program is selected', () => {
    expect(filterLessons(all, '')).toEqual(all);
  });

  it('keeps only the selected program lessons', () => {
    expect(filterLessons(all, 'b').map((l) => l.id)).toEqual(['l3']);
  });

  it('groups lessons by program preserving order', () => {
    const groups = groupLessonsByProgram(all);
    expect(groups.map((g) => [g.programSlug, g.lessons.map((l) => l.id)])).toEqual([
      ['a', ['l1', 'l2']],
      ['b', ['l3']],
    ]);
  });
});
