import { describe, it, expect } from 'vitest';
import { lockedPrerequisiteDay } from './skillTreeLockedHint';
import type { NodeState, TreeNode } from '@/types/skillTree';

const nodes = (...states: NodeState[]): TreeNode[] =>
  states.map((state, i) => ({
    lesson: { id: `l${i}`, unitId: 'u', ordinal: i, title: { en: `L${i}` }, activities: [] },
    state,
    unitIndex: 0,
  }));

describe('lockedPrerequisiteDay', () => {
  it('points at the current lesson when the next one is tapped', () => {
    expect(lockedPrerequisiteDay(nodes('done', 'current', 'locked'), 2)).toBe(2);
  });

  it('points at the first unfinished lesson, not the neighbour, for a node further on', () => {
    expect(lockedPrerequisiteDay(nodes('done', 'current', 'locked', 'locked'), 3)).toBe(2);
  });

  it('crosses a week boundary', () => {
    expect(lockedPrerequisiteDay(nodes('current', 'locked', 'locked'), 2)).toBe(1);
  });

  it('is null when everything before the node is done', () => {
    expect(lockedPrerequisiteDay(nodes('done', 'locked'), 1)).toBeNull();
  });

  it('is null for the first node', () => {
    expect(lockedPrerequisiteDay(nodes('locked'), 0)).toBeNull();
  });
});
