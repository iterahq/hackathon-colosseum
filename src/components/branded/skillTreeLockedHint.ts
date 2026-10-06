import type { TreeNode } from '@/types/skillTree';

/**
 * The day of the earliest unfinished lesson before `index`: finishing it is the
 * first thing standing between the learner and this node. Null when nothing
 * before it is unfinished (the caller then says "the previous lesson").
 */
export function lockedPrerequisiteDay(nodes: TreeNode[], index: number): number | null {
  const blocker = nodes.findIndex((n, i) => i < index && n.state !== 'done');
  return blocker >= 0 ? blocker + 1 : null;
}
