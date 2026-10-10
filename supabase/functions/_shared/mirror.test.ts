import { describe, expect, it } from 'vitest';
import { MAX_MIRROR_PASSES, MIRROR_COOLDOWN_MS, MIRROR_DAILY_CAP, MIRROR_STALE_MS, afterPass, claimDecision, cooldownLeftMs, mirrorPolicy, waitDecision, writesToday, type MirrorFacts } from './mirror';

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

describe('mirror policy (who the authority pays for)', () => {
  const facts = (patch: Partial<MirrorFacts> = {}): MirrorFacts => ({ reason: 'routine', lastWriteAt: ago(5 * 60_000), countedDay: '2026-10-10', countedWrites: 3, now, ...patch });

  it('writes an ordinary mirror when the last write is at least 30 s old', () => {
    expect(MIRROR_COOLDOWN_MS).toBeGreaterThanOrEqual(30_000);
    expect(mirrorPolicy(facts())).toBe('write');
    expect(mirrorPolicy(facts({ lastWriteAt: ago(MIRROR_COOLDOWN_MS) }))).toBe('write');
    expect(mirrorPolicy(facts({ lastWriteAt: null }))).toBe('write');
  });

  it('holds an ordinary mirror inside the cooldown: an equip loop coalesces into one write', () => {
    expect(mirrorPolicy(facts({ lastWriteAt: ago(MIRROR_COOLDOWN_MS - 1) }))).toBe('cooldown');
    expect(mirrorPolicy(facts({ lastWriteAt: ago(0) }))).toBe('cooldown');
    const toggles = Array.from({ length: 20 }, (_, index) => mirrorPolicy(facts({ lastWriteAt: ago(index * 1_000) })));
    expect(toggles.filter((verdict) => verdict === 'write')).toHaveLength(0);
  });

  it('lets the two moments of the demo through at once: a purchase and the last life', () => {
    expect(mirrorPolicy(facts({ reason: 'reached_zero', lastWriteAt: ago(1_000) }))).toBe('write');
    expect(mirrorPolicy(facts({ reason: 'purchase', lastWriteAt: ago(1_000) }))).toBe('write');
    expect(mirrorPolicy(facts({ reason: 'purchase', lastWriteAt: ago(0) }))).toBe('write');
  });

  it('stops every reason at the daily cap, and starts again the next UTC day', () => {
    for (const reason of ['routine', 'purchase', 'reached_zero'] as const) {
      expect(mirrorPolicy(facts({ reason, countedWrites: MIRROR_DAILY_CAP - 1 }))).toBe('write');
      expect(mirrorPolicy(facts({ reason, countedWrites: MIRROR_DAILY_CAP }))).toBe('daily_cap');
      expect(mirrorPolicy(facts({ reason, countedWrites: MIRROR_DAILY_CAP + 7 }))).toBe('daily_cap');
      expect(mirrorPolicy(facts({ reason, countedWrites: MIRROR_DAILY_CAP, countedDay: '2026-10-09' }))).toBe('write');
    }
    expect(MIRROR_DAILY_CAP).toBe(60);
  });

  it('counts writes per UTC day', () => {
    expect(writesToday({ countedDay: '2026-10-10', countedWrites: 12, now })).toBe(12);
    expect(writesToday({ countedDay: '2026-10-09', countedWrites: 12, now })).toBe(0);
    expect(writesToday({ countedDay: null, countedWrites: 12, now })).toBe(0);
    expect(writesToday({ countedDay: '2026-10-10', countedWrites: -4, now })).toBe(0);
  });
});

describe('cooldownLeftMs', () => {
  it('is the rest of the 30 s window, and zero outside it', () => {
    expect(cooldownLeftMs(ago(10_000), now)).toBe(MIRROR_COOLDOWN_MS - 10_000);
    expect(cooldownLeftMs(ago(0), now)).toBe(MIRROR_COOLDOWN_MS);
    expect(cooldownLeftMs(ago(MIRROR_COOLDOWN_MS), now)).toBe(0);
    expect(cooldownLeftMs(null, now)).toBe(0);
    expect(cooldownLeftMs(new Date(now.getTime() + 5_000).toISOString(), now)).toBe(0);
  });
});
