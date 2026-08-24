import type { ProgramDetail, Lesson } from '@/types/content';
import type { NodeState, TreeNode, TreeSection } from '@/types/skillTree';

function lessonDone(lesson: Lesson): boolean {
  // Activity status arrives normalized to the canonical UI value ('done') by the
  // data layer (getProgramBySlug → getLessonProgress → normalizeProgressStatus).
  // The raw DB value 'completed' is accepted defensively so a missed
  // normalization upstream can never silently re-lock a finished lesson.
  const acts = lesson.activities ?? [];
  return acts.length > 0 && acts.every((a) => a.status === 'done' || (a.status as string) === 'completed');
}

/**
 * The unlock frontier is per UNIT, not per program: each unit opens at its own
 * first unfinished lesson. A single program-wide frontier would mean that
 * merging two programs into one retroactively locks every unit after the first
 * — learners who had already finished a later unit would lose the path to work
 * they completed, because the tree is the only navigation into a lesson.
 */
export function buildSections(program: ProgramDetail): TreeSection[] {
  return program.units.map((unit, index) => {
    const lessons = unit.lessons ?? [];
    let currentAssigned = false;
    let doneCount = 0;
    const nodes: TreeNode[] = lessons.map((lesson) => {
      const done = lessonDone(lesson);
      if (done) doneCount++;
      let state: NodeState;
      if (done) {
        state = 'done';
      } else if (!currentAssigned) {
        state = 'current';
        currentAssigned = true;
      } else {
        state = 'locked';
      }
      return { lesson, state, unitIndex: index };
    });
    return { unit, index, nodes, doneCount, total: lessons.length };
  });
}
