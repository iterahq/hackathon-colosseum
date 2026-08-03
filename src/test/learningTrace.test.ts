import { describe, it, expect } from 'vitest';
import {
  buildAttemptTrace,
  readTrace,
  MAX_TRACE_ACTIONS,
  TRACE_SCHEMA_VERSION,
  type RecordedAction,
} from '@/utils/learningTrace';

/**
 * The versioned trace contract (plan 20260731-itera-eventos-aprendizagem,
 * Phase 2).
 *
 * The tests that matter most here are the READER ones. The whole argument for
 * carrying `schema_version` is that the format will change and the old rows
 * must stay interpretable — which is worth exactly nothing unless a reader
 * built today survives a row written by a build from next year. That is what
 * §"leitura tolerante" pins.
 */

const AT = Date.parse('2026-07-31T12:00:00.000Z');

describe('buildAttemptTrace', () => {
  it('carries the schema version ON THE ROW, not implied by its shape', () => {
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 4000, visibleMs: 3000 },
      settledAt: AT,
    });
    expect(trace?.schema_version).toBe(TRACE_SCHEMA_VERSION);
  });

  it('returns NULL when there is no duration — offsets with no origin mean nothing', () => {
    // The only real caller that hits this is the offline outbox replaying an
    // entry serialised before migration 0033. It gets an attempt row and no
    // trace, rather than a sequence dated to when the network came back.
    expect(buildAttemptTrace({ passed: true, duration: null, settledAt: AT })).toBeNull();
  });

  it('returns NULL when the settle instant is unknown, instead of anchoring at "now"', () => {
    // An outbox entry serialised before `settledAt` existed. Anchoring it at the
    // drain time would date the learner's actions to their reconnection — a
    // plausible-looking trace that is simply false, which is worse than none.
    const duration = { elapsedMs: 4000, visibleMs: 3000 };
    expect(buildAttemptTrace({ passed: true, duration, settledAt: null })).toBeNull();
    expect(buildAttemptTrace({ passed: true, duration, settledAt: Number.NaN })).toBeNull();
  });

  it('derives the SAME anchor for the same attempt — what makes a retry idempotent', () => {
    // `flushOutbox` re-sends anything whose write did not land. Because the
    // settle instant travels with the entry, the replay derives an identical
    // `started_at`, and the unique index (user, activity, started_at) turns the
    // second write into a no-op instead of a duplicated sequence.
    const args = {
      passed: true,
      duration: { elapsedMs: 4000, visibleMs: 3000 },
      settledAt: AT,
    } as const;
    expect(buildAttemptTrace(args)?.started_at).toBe(buildAttemptTrace(args)?.started_at);
  });

  it('anchors started_at at (settle − elapsed), i.e. when the activity opened', () => {
    const trace = buildAttemptTrace({
      passed: false,
      duration: { elapsedMs: 90_000, visibleMs: 60_000 },
      settledAt: AT,
    });
    expect(trace?.started_at).toBe(new Date(AT - 90_000).toISOString());
  });

  it('opens at offset 0 and settles at at_ms === elapsed_ms, by construction', () => {
    // This equality is what lets a trace be correlated to its attempt row
    // without a foreign key: the terminal action IS the duration.
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 12_345, visibleMs: 9_000 },
      settledAt: AT,
    });
    expect(trace?.actions).toEqual([
      { type: 'activity_opened', at_ms: 0 },
      { type: 'attempt_settled', at_ms: 12_345, payload: { passed: true } },
    ]);
  });

  it('records the verdict on the terminal action so a replay knows what was shown', () => {
    const miss = buildAttemptTrace({
      passed: false,
      duration: { elapsedMs: 500, visibleMs: 500 },
      settledAt: AT,
    });
    expect(miss?.actions.at(-1)).toMatchObject({ payload: { passed: false } });
  });

  it('does NOT duplicate the answer text or visible_ms — those live on the attempt row', () => {
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 1000, visibleMs: 400 },
      settledAt: AT,
    });
    const flat = JSON.stringify(trace);
    expect(flat).not.toContain('visible');
    expect(flat).not.toContain('response');
  });

  it('is not truncated just because it is short — two actions is EARLY, not cut', () => {
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 10, visibleMs: 10 },
      settledAt: AT,
    });
    expect(trace?.actions_truncated).toBe(false);
  });
});

describe('buildAttemptTrace — the reducer sequence (sub-plan 1, Fase A)', () => {
  /** The origin the builder derives: settle minus elapsed. */
  const originOf = (elapsedMs: number) => AT - elapsedMs;

  it('rebases WALL CLOCK onto offsets, keeping order, between open and settle', () => {
    // This is the property the whole `RecordedAction` type exists for: the
    // activity stamps `Date.now()` because it cannot see the player's origin,
    // and the builder — which derives the origin anyway for `started_at` — is
    // the one place that can convert without a second clock.
    const origin = originOf(300);
    const rich: RecordedAction[] = [
      { type: 'option_selected', at: origin + 100, payload: { option_id: 'a' } },
      { type: 'option_deselected', at: origin + 200, payload: { option_id: 'a' } },
    ];
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 300, visibleMs: 300 },
      settledAt: AT,
      actions: rich,
    });
    expect(trace?.actions.map((a) => a.at_ms)).toEqual([0, 100, 200, 300]);
    expect(trace?.actions.map((a) => a.type)).toEqual([
      'activity_opened',
      'option_selected',
      'option_deselected',
      'attempt_settled',
    ]);
    // `started_at` and the rebase must use the SAME origin, or every offset is
    // silently shifted against the anchor it is supposed to be relative to.
    expect(trace?.started_at).toBe(new Date(origin).toISOString());
  });

  it('preserves the payload verbatim and omits the key when there is none', () => {
    const origin = originOf(50);
    const trace = buildAttemptTrace({
      passed: false,
      duration: { elapsedMs: 50, visibleMs: 50 },
      settledAt: AT,
      actions: [
        { type: 'pair_made', at: origin + 10, payload: { left_id: 'l1', right_id: 'r2' } },
        { type: 'pair_armed', at: origin + 20 },
      ],
    });
    expect(trace?.actions[1]).toEqual({
      type: 'pair_made',
      at_ms: 10,
      payload: { left_id: 'l1', right_id: 'r2' },
    });
    expect(trace?.actions[2]).toEqual({ type: 'pair_armed', at_ms: 20 });
  });

  it('clamps into [0, elapsed] rather than dropping the action or the trace', () => {
    // Below 0: recorded a tick before the player armed its origin (the resume
    // gate). Above `elapsed`: a stray during the settle itself. A negative
    // at_ms violates the DB envelope CHECK and would cost the WHOLE row; an
    // offset past the terminal action would put the sequence out of order with
    // itself, which is a corrupted trace that still looks valid.
    const origin = originOf(50);
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 50, visibleMs: 50 },
      settledAt: AT,
      actions: [
        { type: 'option_selected', at: origin - 5_000 },
        { type: 'option_selected', at: Number.NaN },
        { type: 'option_selected', at: origin + 999_999 },
      ],
    });
    expect(trace?.actions.map((a) => a.at_ms)).toEqual([0, 0, 0, 50, 50]);
  });

  it('truncates at the cap, flags it, and NEVER drops the terminal action', () => {
    const origin = originOf(9_999);
    const many: RecordedAction[] = Array.from({ length: MAX_TRACE_ACTIONS + 50 }, (_, i) => ({
      type: 'option_selected',
      at: origin + i,
    }));
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 9_999, visibleMs: 9_999 },
      settledAt: AT,
      actions: many,
    });
    expect(trace?.actions).toHaveLength(MAX_TRACE_ACTIONS);
    expect(trace?.actions_truncated).toBe(true);
    // The outcome is the one thing that must survive a cut: a trace that lost
    // its verdict reads as an abandoned attempt.
    expect(trace?.actions.at(-1)).toEqual({
      type: 'attempt_settled',
      at_ms: 9_999,
      payload: { passed: true },
    });
    expect(trace?.actions[0]).toEqual({ type: 'activity_opened', at_ms: 0 });
  });

  it('reports an UPSTREAM trim, so a queue-trimmed sequence never reads as whole', () => {
    // The durable outbox caps a queued entry's actions to protect the
    // localStorage quota (MAX_QUEUED_TRACE_ACTIONS). The cut happens before the
    // builder sees the list, so the flag has to ride separately — otherwise the
    // row would claim a complete sequence it does not have.
    const trace = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 100, visibleMs: 100 },
      settledAt: AT,
      actions: [{ type: 'option_selected', at: AT }],
      actionsTruncated: true,
    });
    expect(trace?.actions).toHaveLength(3);
    expect(trace?.actions_truncated).toBe(true);
  });
});

describe('readTrace — leitura tolerante (a versão só vale se o leitor velho sobreviver)', () => {
  it('reads a row this build wrote, round-trip', () => {
    const written = buildAttemptTrace({
      passed: true,
      duration: { elapsedMs: 700, visibleMs: 700 },
      settledAt: AT,
    });
    const read = readTrace(JSON.parse(JSON.stringify(written)));
    expect(read?.schema_version).toBe(TRACE_SCHEMA_VERSION);
    expect(read?.from_future).toBe(false);
    expect(read?.actions).toHaveLength(2);
  });

  it('does NOT break on an UNKNOWN (newer) schema_version — it reports it', () => {
    // The V2 criterion of the plan. A reader that rejected a version it did not
    // know would silently discard exactly the newest data — during every
    // rollout, since the app auto-deploys and migrations are applied by hand.
    const read = readTrace({
      schema_version: 99,
      started_at: '2027-01-01T00:00:00.000Z',
      actions: [{ type: 'hypothesis_rejected', at_ms: 12, payload: { file: 'a.ts', novo: 1 } }],
      actions_truncated: false,
    });
    expect(read).not.toBeNull();
    expect(read?.schema_version).toBe(99);
    expect(read?.from_future).toBe(true);
    expect(read?.actions).toHaveLength(1);
  });

  it('passes an unknown action type and unknown payload keys through VERBATIM', () => {
    const read = readTrace({
      schema_version: 1,
      actions: [{ type: 'misconception_detected', at_ms: 5, payload: { concept: 'estado' } }],
    });
    expect(read?.actions[0]).toEqual({
      type: 'misconception_detected',
      at_ms: 5,
      payload: { concept: 'estado' },
    });
  });

  it('skips individually broken actions without losing the rest of the sequence', () => {
    const read = readTrace({
      schema_version: 1,
      actions: [
        { type: 'ok', at_ms: 0 },
        { type: 42, at_ms: 1 }, // type not a string
        { type: 'negativo', at_ms: -1 }, // offset out of range
        { at_ms: 2 }, // no type
        { type: 'payload-errado', at_ms: 3, payload: ['nope'] },
        'lixo',
        null,
        { type: 'ok2', at_ms: 4 },
      ],
    });
    expect(read?.actions.map((a) => a.type)).toEqual(['ok', 'ok2']);
  });

  it('treats a missing/garbage version as 0 rather than assuming the current one', () => {
    // Assuming TRACE_SCHEMA_VERSION here would be the exact ambiguity the
    // column exists to prevent: an unversioned row silently reinterpreted as if
    // it had been written under today's rules.
    expect(readTrace({ actions: [] })?.schema_version).toBe(0);
    expect(readTrace({ schema_version: 'v1', actions: [] })?.schema_version).toBe(0);
  });

  it('never throws on junk; returns null only when there is no object at all', () => {
    expect(readTrace(null)).toBeNull();
    expect(readTrace('não é linha')).toBeNull();
    expect(readTrace([])).toBeNull();
    expect(readTrace({})).toMatchObject({ schema_version: 0, actions: [], started_at: null });
    expect(readTrace({ actions: 'nope' })?.actions).toEqual([]);
  });
});
