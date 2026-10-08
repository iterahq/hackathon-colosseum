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

/**
 * True when the learner went through the WHOLE lesson and what keeps it open is
 * answers that missed. The tree then says so: "finish Day N" reads as a bug to
 * someone who already reached its last screen.
 */
export function onlyMissesLeft(node: Pick<TreeNode, 'missed' | 'unanswered'>): boolean {
  return node.unanswered === 0 && node.missed > 0;
}

/** How many answers missed on the lesson that blocks `index`, when misses are all that is left of it; else 0. */
export function lockedBehindMisses(nodes: TreeNode[], index: number): number {
  const blocker = nodes.find((n, i) => i < index && n.state !== 'done');
  return blocker && onlyMissesLeft(blocker) ? blocker.missed : 0;
}
