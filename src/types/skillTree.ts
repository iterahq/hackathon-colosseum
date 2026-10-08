import type { Lesson, Unit } from '@/types/content';

export type NodeState = 'done' | 'current' | 'locked';

export interface TreeNode {
  lesson: Lesson;
  state: NodeState;
  unitIndex: number;
  /** Activities the learner answered and did not pass ('in_progress'). */
  missed: number;
  /** Activities the learner has not answered at all ('todo'). */
  unanswered: number;
}

export interface TreeSection {
  unit: Unit;
  index: number;
  nodes: TreeNode[];
  doneCount: number;
  total: number;
}
