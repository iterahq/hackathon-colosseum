import { describe, expect, it } from 'vitest';
import { chainReadLabel, formatAge } from './chainRead';

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? ':' + Object.values(vars).join(',') : ''}`;

describe('formatAge', () => {
  it('rounds to seconds, minutes, then hours', () => {
    expect(formatAge(4_400, t)).toBe('chain.age.s:4');
    expect(formatAge(59_400, t)).toBe('chain.age.s:59');
    expect(formatAge(150_000, t)).toBe('chain.age.min:3');
    expect(formatAge(2 * 3_600_000, t)).toBe('chain.age.h:2');
    expect(formatAge(-5, t)).toBe('chain.age.s:0');
  });
});

describe('chainReadLabel', () => {
  it('says how long a live read took, also when the function sent no read block', () => {
    expect(chainReadLabel(undefined, 412, t)).toBe('passport.credential.readIn:412');
    expect(chainReadLabel({ source: 'chain', at: 'x', ageMs: 0, ms: 880 }, 412, t)).toBe('passport.credential.readIn:880');
  });

  it('says how old a cached answer is', () => {
    expect(chainReadLabel({ source: 'cache', at: 'x', ageMs: 12_000, ms: 880 }, 412, t)).toBe('chain.readAgo:chain.age.s:12');
  });
});
