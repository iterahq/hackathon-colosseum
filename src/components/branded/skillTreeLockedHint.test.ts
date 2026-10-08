import { describe, it, expect } from 'vitest';
import { lockedBehindMisses, lockedPrerequisiteDay, onlyMissesLeft } from './skillTreeLockedHint';
import type { NodeState, TreeNode } from '@/types/skillTree';

const nodes = (...states: NodeState[]): TreeNode[] =>
  states.map((state, i) => ({
    lesson: { id: `l${i}`, unitId: 'u', ordinal: i, title: { en: `L${i}` }, activities: [] },
    state,
    unitIndex: 0,
    missed: 0,
    unanswered: 0,
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

describe('onlyMissesLeft / lockedBehindMisses', () => {
  const trail = (blocker: { missed: number; unanswered: number }): TreeNode[] => {
    const [a, b] = nodes('current', 'locked');
    return [{ ...a, ...blocker }, b];
  };

  it('is the case of a learner who reached the last screen with answers that missed', () => {
    expect(onlyMissesLeft({ missed: 2, unanswered: 0 })).toBe(true);
    expect(lockedBehindMisses(trail({ missed: 2, unanswered: 0 }), 1)).toBe(2);
  });

  it('is not the case while a screen was never answered, or when nothing missed', () => {
    expect(onlyMissesLeft({ missed: 2, unanswered: 3 })).toBe(false);
    expect(onlyMissesLeft({ missed: 0, unanswered: 0 })).toBe(false);
    expect(lockedBehindMisses(trail({ missed: 2, unanswered: 3 }), 1)).toBe(0);
  });

  it('reads the EARLIEST unfinished lesson, the one the hint names', () => {
    const [a, b, c] = nodes('current', 'locked', 'locked');
    expect(lockedBehindMisses([{ ...a, missed: 1 }, { ...b, unanswered: 4 }, c], 2)).toBe(1);
  });
});
