import { describe, expect, it } from 'vitest';
import { HARD_MS, SOFT_MS, cacheVerdict, wantsFresh, type CacheRow } from './read-cache';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const row = (ageMs: number, version = 'v1'): CacheRow => ({ version, body: { ok: true }, read_at: new Date(NOW - ageMs).toISOString(), read_ms: 900 });

describe('cacheVerdict', () => {
  it('serves a young row whose version matches', () => {
    expect(cacheVerdict(row(5_000), 'v1', NOW, false)).toBe('serve');
  });

  it('serves and refreshes a row older than the soft limit', () => {
    expect(cacheVerdict(row(SOFT_MS + 1), 'v1', NOW, false)).toBe('serve_and_refresh');
  });

  it('reads live when the database knows about a newer write', () => {
    expect(cacheVerdict(row(5_000, 'v0'), 'v1', NOW, false)).toBe('live');
  });

  it('reads live past the hard limit, when asked for fresh, with no row, or with a clock from the future', () => {
    expect(cacheVerdict(row(HARD_MS + 1), 'v1', NOW, false)).toBe('live');
    expect(cacheVerdict(row(5_000), 'v1', NOW, true)).toBe('live');
    expect(cacheVerdict(null, 'v1', NOW, false)).toBe('live');
    expect(cacheVerdict(row(-5_000), 'v1', NOW, false)).toBe('live');
  });
});

describe('wantsFresh', () => {
  it('reads only fresh=1', () => {
    expect(wantsFresh(new Request('https://x/f/a?fresh=1'))).toBe(true);
    expect(wantsFresh(new Request('https://x/f/a?fresh=true'))).toBe(false);
    expect(wantsFresh(new Request('https://x/f/a'))).toBe(false);
  });
});
