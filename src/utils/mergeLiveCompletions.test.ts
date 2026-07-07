import { describe, it, expect } from 'vitest';
import { mergeLiveCompletions } from './mergeLiveCompletions';
import type { ClassCompleter } from '@/types/liveClass';

const base: ClassCompleter[] = [
  { userId: 'u1', name: 'Ana', done: false },
  { userId: 'u2', name: 'Beto', done: true },
  { userId: 'u3', name: 'Cida', done: false },
];

describe('mergeLiveCompletions', () => {
  it('flags a present learner done from a live broadcast before the next poll', () => {
    const out = mergeLiveCompletions(base, ['u1']);
    expect(out.find((c) => c.userId === 'u1')?.done).toBe(true);
    expect(out.find((c) => c.userId === 'u3')?.done).toBe(false);
  });

  it('leaves already-done learners untouched and ignores unknown ids', () => {
    const out = mergeLiveCompletions(base, ['u2', 'ghost']);
    expect(out.filter((c) => c.done).map((c) => c.userId)).toEqual(['u2']);
  });

  it('returns the input unchanged when there are no live completions', () => {
    expect(mergeLiveCompletions(base, [])).toBe(base);
  });
});
