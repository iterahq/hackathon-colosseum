import { describe, expect, it } from 'vitest';
import { RateLimiter, callerAddress } from './ratelimit.ts';

describe('RateLimiter', () => {
  it('allows up to the limit inside the window, then refuses with a retry delay', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 10_000 });
    expect(limiter.take('a', 1_000).allowed).toBe(true);
    expect(limiter.take('a', 2_000).allowed).toBe(true);
    expect(limiter.take('a', 3_000)).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    const refused = limiter.take('a', 4_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(7);
  });

  it('frees a slot once the oldest hit leaves the window, and keeps callers apart', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.take('a', 0).allowed).toBe(true);
    expect(limiter.take('b', 0).allowed).toBe(true);
    expect(limiter.take('a', 500).allowed).toBe(false);
    expect(limiter.take('a', 1_001).allowed).toBe(true);
  });

  it('never grows past the tracking cap', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1_000 });
    for (let i = 0; i < 6_000; i += 1) limiter.take(`k${i}`, i);
    expect((limiter as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(5_000);
  });
});

describe('callerAddress', () => {
  it('prefers the platform header and takes the first forwarded hop', () => {
    expect(callerAddress(new Request('https://x', { headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } }))).toBe('1.2.3.4');
    expect(callerAddress(new Request('https://x', { headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } }))).toBe('5.6.7.8');
    expect(callerAddress(new Request('https://x'))).toBe('unknown');
  });
});
