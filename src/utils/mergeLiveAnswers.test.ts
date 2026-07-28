import { describe, it, expect } from 'vitest';
import { mergeLiveAnswers } from './mergeLiveAnswers';
import type { ClassCompleter } from '@/types/liveClass';

const base: ClassCompleter[] = [
  { userId: 'u1', name: 'Ana', avatarUrl: null, done: false },
  { userId: 'u2', name: 'Beto', avatarUrl: null, done: true },
  { userId: 'u3', name: 'Cida', avatarUrl: null, done: false },
];

describe('mergeLiveAnswers', () => {
  it('flags a live correct answer as done and a live wrong answer as wrong', () => {
    const out = mergeLiveAnswers(base, { u1: true, u3: false });
    expect(out.find((a) => a.userId === 'u1')?.state).toBe('done');
    expect(out.find((a) => a.userId === 'u3')?.state).toBe('wrong');
  });

  it('keeps already-done learners done and treats the rest as pending', () => {
    const out = mergeLiveAnswers(base, undefined);
    expect(out.map((a) => a.state)).toEqual(['pending', 'done', 'pending']);
  });

  it('never downgrades a done learner to wrong', () => {
    const out = mergeLiveAnswers(base, { u2: false });
    expect(out.find((a) => a.userId === 'u2')?.state).toBe('done');
  });

  it('maps per-learner elapsed time when provided', () => {
    const out = mergeLiveAnswers(base, { u1: true }, { u1: 45000 });
    expect(out.find((a) => a.userId === 'u1')?.elapsedMs).toBe(45000);
    expect(out.find((a) => a.userId === 'u2')?.elapsedMs).toBeUndefined();
  });
});
