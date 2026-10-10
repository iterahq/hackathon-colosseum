import { describe, expect, it } from 'vitest';
import { MAX_MIRROR_PASSES, MIRROR_STALE_MS, afterPass, claimDecision, waitDecision } from './mirror';

const now = new Date('2026-10-10T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('claimDecision', () => {
  it('claims a mirror nobody holds', () => {
    expect(claimDecision(null, now)).toBe('claim');
  });

  it('defers to a mirror in flight', () => {
    expect(claimDecision(ago(0), now)).toBe('defer');
    expect(claimDecision(ago(3_000), now)).toBe('defer');
    expect(claimDecision(ago(MIRROR_STALE_MS), now)).toBe('defer');
  });

  it('takes over a claim whose holder went silent', () => {
    expect(claimDecision(ago(MIRROR_STALE_MS + 1), now)).toBe('claim');
  });
});

describe('afterPass', () => {
  it('releases when nobody asked for another write', () => {
    expect(afterPass({ dirty: false, pass: 1 })).toBe('release');
    expect(afterPass({ dirty: false, pass: MAX_MIRROR_PASSES })).toBe('release');
  });

  it('reads and writes again when a caller deferred meanwhile', () => {
    expect(afterPass({ dirty: true, pass: 1 })).toBe('rerun');
    expect(afterPass({ dirty: true, pass: MAX_MIRROR_PASSES - 1 })).toBe('rerun');
  });

  it('is bounded: still dirty after the last pass leaves the row owed', () => {
    expect(afterPass({ dirty: true, pass: MAX_MIRROR_PASSES })).toBe('yield');
    expect(afterPass({ dirty: true, pass: 1 }, 1)).toBe('yield');
  });
});

describe('waitDecision', () => {
  it('a background caller defers at once', () => {
    expect(waitDecision(1_000, 1_000, 0)).toBe('defer');
  });

  it('a caller that wants the proof keeps asking inside its patience', () => {
    expect(waitDecision(1_000, 1_000, 6_000)).toBe('retry');
    expect(waitDecision(1_000, 6_999, 6_000)).toBe('retry');
    expect(waitDecision(1_000, 7_000, 6_000)).toBe('defer');
  });
});
