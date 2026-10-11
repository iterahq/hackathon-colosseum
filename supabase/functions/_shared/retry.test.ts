import { describe, expect, it, vi } from 'vitest';
import { withRetries } from './retry';

const options = { attempts: 3, pauseMs: (failed: number) => failed * 100, sleep: vi.fn(async () => {}) };

describe('withRetries', () => {
  it('returns the first success and remembers what failed before it', async () => {
    const work = vi.fn().mockRejectedValueOnce(new Error('429 Too Many Requests')).mockResolvedValueOnce('sig');
    const sleep = vi.fn(async () => {});
    expect(await withRetries(work, { ...options, sleep })).toEqual({ ok: true, value: 'sig', attempts: 2, errors: ['429 Too Many Requests'] });
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('gives up after the attempts and never throws', async () => {
    const work = vi.fn().mockRejectedValue(new Error('down'));
    expect(await withRetries(work, options)).toEqual({ ok: false, attempts: 3, errors: ['down', 'down', 'down'] });
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('stops when the caller has no budget left', async () => {
    const work = vi.fn().mockRejectedValue('boom');
    expect(await withRetries(work, { ...options, mayRetry: () => false })).toEqual({ ok: false, attempts: 1, errors: ['boom'] });
  });

  it('passes the attempt number to the work', async () => {
    const seen: number[] = [];
    await withRetries(async (attempt) => { seen.push(attempt); if (attempt < 3) throw new Error('x'); }, options);
    expect(seen).toEqual([1, 2, 3]);
  });
});
