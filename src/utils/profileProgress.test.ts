import { describe, expect, it } from 'vitest';
import { profileProgress } from './profileProgress';

const t = (key: string, vars: Record<string, string | number> = {}) => `${key} ${JSON.stringify(vars)}`;

describe('profileProgress', () => {
  it('says no day is stamped for an empty profile', () => {
    expect(profileProgress([], t)).toBe('profile.progress.none {}');
  });
  it('counts one trail without naming a trail count', () => {
    expect(profileProgress([{ daysDone: 1, totalDays: 5 }], t)).toBe('profile.progress.one {"done":1,"total":5}');
  });
  it('sums several trails', () => {
    expect(profileProgress([{ daysDone: 5, totalDays: 5 }, { daysDone: 2, totalDays: 5 }], t)).toBe('profile.progress {"done":7,"total":10,"trails":2}');
  });
});
