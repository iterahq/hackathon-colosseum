import type { Lesson, Unit } from '@/types/content';

export type NodeState = 'done' | 'current' | 'locked';

export interface TreeNode {
  lesson: Lesson;
  state: NodeState;
  unitIndex: number;
}

export interface TreeSection {
  unit: Unit;
  index: number;
  nodes: TreeNode[];
  doneCount: number;
  total: number;
}
