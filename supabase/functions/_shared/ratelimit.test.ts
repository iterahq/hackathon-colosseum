import { describe, expect, it } from 'vitest';
import { callerAddress, takeRate, tooMany, verdictOf } from './ratelimit.ts';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const dbWith = (rpc: Rpc) => ({ rpc }) as unknown as Parameters<typeof takeRate>[0];

describe('verdictOf', () => {
  it('reads the row the database function returns, as a list or alone', () => {
    expect(verdictOf([{ allowed: false, remaining: 0, retry_after_seconds: 7 }])).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 7 });
    expect(verdictOf({ allowed: true, remaining: 3, retry_after_seconds: 0 })).toEqual({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
  });

  it('is open when the shape is not the one expected', () => {
    expect(verdictOf(null).allowed).toBe(true);
    expect(verdictOf([]).allowed).toBe(true);
  });
});

describe('takeRate', () => {
  it('keys the counter by scope and address and passes the rule', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const db = dbWith(async (name, args) => {
      calls.push([name, args]);
      return { data: [{ allowed: true, remaining: 59, retry_after_seconds: 0 }], error: null };
    });
    expect(await takeRate(db, 'share-meta', '1.2.3.4', { limit: 60, windowMs: 60_000 })).toEqual({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
    expect(calls).toEqual([['rate_take', { p_key: 'share-meta:1.2.3.4', p_limit: 60, p_window_ms: 60_000 }]]);
  });

  it('lets the request through when the counter is unreachable', async () => {
    const db = dbWith(async () => ({ data: null, error: { message: 'down' } }));
    const quiet = console.error;
    console.error = () => {};
    try {
      expect((await takeRate(db, 'x', 'a', { limit: 1, windowMs: 1 })).allowed).toBe(true);
    } finally {
      console.error = quiet;
    }
  });
});

describe('callerAddress', () => {
  it('prefers the platform header and takes the first forwarded hop', () => {
    expect(callerAddress(new Request('https://x', { headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } }))).toBe('1.2.3.4');
    expect(callerAddress(new Request('https://x', { headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } }))).toBe('5.6.7.8');
    expect(callerAddress(new Request('https://x'))).toBe('unknown');
  });
});

describe('tooMany', () => {
  it('answers 429 with Retry-After', async () => {
    const response = tooMany({ allowed: false, remaining: 0, retryAfterSeconds: 12 }, { 'Access-Control-Allow-Origin': '*' });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(await response.json()).toEqual({ error: 'rate_limited', retry_after_seconds: 12 });
  });
});
