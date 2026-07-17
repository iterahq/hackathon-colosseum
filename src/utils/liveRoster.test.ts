import { describe, it, expect } from 'vitest';
import { mergeSeenLearners } from './liveRoster';
import type { ClassPresenceMember } from '@/types/liveClass';

const m = (userId: string, name: string, isInstructor = false): ClassPresenceMember => ({
  userId,
  name,
  isInstructor,
});

describe('mergeSeenLearners', () => {
  it('accumulates learners and never drops one who left', () => {
    let seen = mergeSeenLearners(new Map(), [m('a', 'Ana'), m('b', 'Bruno')]);
    // Bruno leaves — the live roster no longer includes him.
    seen = mergeSeenLearners(seen, [m('a', 'Ana')]);
    expect([...seen.keys()].sort()).toEqual(['a', 'b']);
  });

  it('excludes the instructor', () => {
    const seen = mergeSeenLearners(new Map(), [m('prof', 'Prof', true), m('a', 'Ana')]);
    expect([...seen.keys()]).toEqual(['a']);
  });

  it('refreshes name/avatar for a returning learner', () => {
    let seen = mergeSeenLearners(new Map(), [{ userId: 'a', name: 'A', avatarUrl: null, isInstructor: false }]);
    seen = mergeSeenLearners(seen, [{ userId: 'a', name: 'Ana', avatarUrl: 'x.png', isInstructor: false }]);
    expect(seen.get('a')).toEqual({ userId: 'a', name: 'Ana', avatarUrl: 'x.png', isInstructor: false });
  });

  it('does not mutate the previous map', () => {
    const prev = mergeSeenLearners(new Map(), [m('a', 'Ana')]);
    const next = mergeSeenLearners(prev, [m('b', 'Bruno')]);
    expect(prev.has('b')).toBe(false);
    expect(next.has('b')).toBe(true);
  });
});
