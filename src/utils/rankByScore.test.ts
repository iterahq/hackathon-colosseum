import { describe, it, expect } from 'vitest';
import { rankByScore } from './rankByScore';
import type { ClassPresenceMember } from '@/types/liveClass';

const roster: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof', isInstructor: true },
  { userId: 'a', name: 'Ana', isInstructor: false },
  { userId: 'b', name: 'Bruno', isInstructor: false },
  { userId: 'c', name: 'Caio', isInstructor: false },
];

describe('rankByScore', () => {
  it('ranks by most correct first, excluding the instructor', () => {
    const elapsed = { act1: { a: 5000, b: 3000 }, act2: { a: 5000, b: 3000 } };
    const answers = {
      act1: { a: true, b: true },
      act2: { a: true, b: false },
    };
    const { ranked } = rankByScore(roster, elapsed, answers);
    // Ana got 2 right, Bruno 1 — accuracy wins over Bruno's faster time.
    expect(ranked.map((r) => r.name)).toEqual(['Ana', 'Bruno']);
    expect(ranked[0]).toMatchObject({ rank: 1, name: 'Ana', correctCount: 2 });
  });

  it('breaks equal scores by faster cumulative time, then name', () => {
    const elapsed = { act1: { a: 8000, b: 3000 } };
    const answers = { act1: { a: true, b: true } };
    const { ranked } = rankByScore(roster, elapsed, answers);
    // Both scored 1 — Bruno answered faster (3000 < 8000) so ranks ahead.
    expect(ranked.map((r) => r.name)).toEqual(['Bruno', 'Ana']);
    expect(ranked[0].rank).toBe(1);
  });

  it('lists learners who never answered as waiting', () => {
    const elapsed = { act1: { a: 4000 } };
    const answers = { act1: { a: true } };
    const { ranked, waiting } = rankByScore(roster, elapsed, answers);
    expect(ranked.map((r) => r.name)).toEqual(['Ana']);
    expect(waiting.map((w) => w.name)).toEqual(['Bruno', 'Caio']);
  });

  it('returns nobody ranked when there are no answers', () => {
    const { ranked, waiting } = rankByScore(roster, {}, {});
    expect(ranked).toHaveLength(0);
    expect(waiting.map((w) => w.name)).toEqual(['Ana', 'Bruno', 'Caio']);
  });
});
