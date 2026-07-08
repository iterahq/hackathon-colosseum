import { describe, it, expect } from 'vitest';
import { rankByTiming } from './rankByTiming';
import type { ClassPresenceMember } from '@/types/liveClass';

const roster: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof', isInstructor: true },
  { userId: 'a', name: 'Ana', isInstructor: false },
  { userId: 'b', name: 'Bruno', isInstructor: false },
  { userId: 'c', name: 'Caio', isInstructor: false },
];

describe('rankByTiming', () => {
  it('ranks present learners by cumulative answer time (fastest first) and excludes the instructor', () => {
    const elapsed = {
      act1: { a: 5000, b: 3000 },
      act2: { a: 2000, b: 6000 },
    };
    const { ranked, waiting } = rankByTiming(roster, elapsed);
    expect(ranked.map((r) => r.name)).toEqual(['Ana', 'Bruno']); // 7000 < 9000
    expect(ranked[0]).toMatchObject({ rank: 1, name: 'Ana', totalMs: 7000, answeredCount: 0 });
    expect(ranked[1].rank).toBe(2);
    expect(waiting.map((w) => w.name)).toEqual(['Caio']); // present, never answered
  });

  it('carries answered/correct counts from the answers map', () => {
    const elapsed = { act1: { a: 4000 } };
    const answers = { act1: { a: true }, act2: { a: false } };
    const { ranked } = rankByTiming(roster, elapsed, answers);
    expect(ranked[0]).toMatchObject({ answeredCount: 2, correctCount: 1, totalMs: 4000 });
  });

  it('breaks equal times by more answers, then name', () => {
    const elapsed = { act1: { a: 5000, b: 5000 }, act2: { b: 0 } };
    const answers = { act1: { a: true, b: true }, act2: { b: true } };
    const { ranked } = rankByTiming(roster, elapsed, answers);
    // Bruno ties on time (5000) but answered more → ranks ahead of Ana.
    expect(ranked.map((r) => r.name)).toEqual(['Bruno', 'Ana']);
  });

  it('returns everyone as waiting when nobody has answered', () => {
    const { ranked, waiting } = rankByTiming(roster, {}, {});
    expect(ranked).toHaveLength(0);
    expect(waiting.map((w) => w.name)).toEqual(['Ana', 'Bruno', 'Caio']);
  });
});
