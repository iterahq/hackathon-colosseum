import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Where the trace is EMITTED (plan 20260731-itera-eventos-aprendizagem,
 * Phase 4) and, more importantly, what it is NOT allowed to break.
 *
 * Three properties are under test, and only the first is really about
 * telemetry:
 *
 *  1. A settled attempt writes exactly ONE `activity_traces` row, carrying
 *     `schema_version` and the sequence.
 *  2. IT COVERS EVERY PATH. The emission lives INSIDE
 *     `persistActivityProgress`, not at its call sites, and that is a coverage
 *     property: live class and every self-paced MISS reach the service through
 *     the durable outbox (`writeOrQueue` → `sendOutboxEntry`), while only the
 *     self-paced PASS calls in directly. Instrumenting call sites would have
 *     captured passes in self-paced mode and nothing else — the exact shape of
 *     the 0028 defect, a log that holds only wins and looks complete.
 *  3. IT CAN NEVER COST THE ATTEMPT. The app auto-deploys on merge to `main`
 *     and no CI applies Itera migrations, so a build is routinely live before
 *     its migration is. "Table does not exist" therefore has to be an ordinary
 *     Tuesday: the attempt row must still land and the caller must still be
 *     told the save succeeded.
 *
 * The regression behind (3) is the one migration 0033 nearly caused: a payload
 * naming a column the deployed schema lacks makes PostgREST reject the WHOLE
 * statement, so an unguarded telemetry field can stop the data it was meant to
 * enrich from being recorded at all — silently, and unrecoverably.
 */

/** Every row handed to `.insert()` / `.upsert()`, keyed by table. */
const inserts: Record<string, Array<Record<string, unknown>>> = {};
const upserts: Record<string, Array<{ payload: Record<string, unknown>; opts?: unknown }>> = {};

/** Lets a test make one table's write fail the way PostgREST does. */
let errorFor: ((table: string) => { message: string } | null) | null = null;
/** Lets a test make one table's write THROW, not merely return an error. */
let throwsFor: string | null = null;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        (upserts[table] ??= []).push({ payload, opts });
        if (throwsFor === table) throw new Error(`relation "${table}" does not exist`);
        return Promise.resolve({ error: errorFor?.(table) ?? null });
      },
      insert: (payload: Record<string, unknown>) => {
        (inserts[table] ??= []).push(payload);
        if (throwsFor === table) throw new Error(`relation "${table}" does not exist`);
        return Promise.resolve({ error: errorFor?.(table) ?? null });
      },
    }),
  }),
}));
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: vi.fn().mockResolvedValue('itera-user-1'),
}));
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: vi.fn().mockResolvedValue(undefined),
}));

import { persistActivityProgress } from '@/services/progress.service';
import { sendOutboxEntry } from '@/hooks/useAnswerOutbox';
import { TRACE_SCHEMA_VERSION } from '@/utils/learningTrace';

const DURATION = { elapsedMs: 8_000, visibleMs: 6_000 };
/** The instant the learner ANSWERED — stamped at the origin, never at the write. */
const SETTLED_AT = Date.parse('2026-07-31T12:00:00.000Z');
const OPENED_AT = new Date(SETTLED_AT - DURATION.elapsedMs).toISOString();

/** The trace rows written so far. */
const traces = () => upserts['activity_traces'] ?? [];

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  for (const k of Object.keys(upserts)) delete upserts[k];
  errorFor = null;
  throwsFor = null;
});

describe('persistActivityProgress → itera.activity_traces', () => {
  it('writes ONE trace row per settled attempt, not one row per action', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      response: 'A',
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()).toHaveLength(1);
  });

  it('stamps schema_version ON THE ROW and scopes it to the learner + activity', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()[0].payload).toMatchObject({
      schema_version: TRACE_SCHEMA_VERSION,
      user_id: 'itera-user-1',
      activity_id: 'act-1',
      actions_truncated: false,
    });
  });

  it('records the sequence, ending on the real outcome', async () => {
    await persistActivityProgress('act-1', {
      passed: false,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()[0].payload.actions).toEqual([
      { type: 'activity_opened', at_ms: 0 },
      { type: 'attempt_settled', at_ms: 8_000, payload: { passed: false } },
    ]);
  });

  it('anchors the trace at the SETTLE, not at the write', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    // SETTLED_AT is a fixed instant in the past; a `Date.now()` anchor inside
    // the service would make this assertion impossible to satisfy.
    expect(traces()[0].payload.started_at).toBe(OPENED_AT);
  });

  it('is written idempotently, so an outbox retry cannot duplicate the sequence', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()[0].opts).toEqual({
      onConflict: 'user_id,activity_id,started_at',
      ignoreDuplicates: true,
    });
  });

  it('writes NO trace when the attempt had no measured duration', async () => {
    // The outbox replaying a pre-0033 entry. Offsets with no origin are not a
    // sequence, so the attempt is recorded and the trace is not invented.
    await persistActivityProgress('act-1', {
      passed: true,
      duration: null,
      settledAt: SETTLED_AT,
    });
    expect(inserts['activity_results']).toHaveLength(1);
    expect(traces()).toHaveLength(0);
  });

  it('writes NO trace when the settle instant is unknown', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: null,
    });
    expect(inserts['activity_results']).toHaveLength(1);
    expect(traces()).toHaveLength(0);
  });

  it('carries a caller-supplied rich sequence through, rebased onto the origin', async () => {
    // The activity stamps WALL CLOCK (it does not know the origin); the trace
    // stores offsets. 2s after the activity opened == `elapsedMs - 6000`.
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      actions: [
        { type: 'option_selected', at: SETTLED_AT - DURATION.elapsedMs + 2_000, payload: { option_id: 'b' } },
      ],
    });
    const actions = traces()[0].payload.actions as Array<{ type: string; at_ms: number }>;
    expect(actions.map((a) => a.type)).toEqual([
      'activity_opened',
      'option_selected',
      'attempt_settled',
    ]);
    expect(actions[1].at_ms).toBe(2_000);
  });

  it('carries the upstream truncation flag so a trimmed sequence never reads as whole', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      actions: [{ type: 'option_selected', at: SETTLED_AT }],
      actionsTruncated: true,
    });
    expect(traces()[0].payload.actions_truncated).toBe(true);
  });
});

describe('cobertura: o caminho da fila também emite trace', () => {
  it('an outbox entry produces a trace anchored at the ANSWER, not at the drain', async () => {
    // This is the path the live class and every self-paced miss take. The entry
    // was queued when the network was down; it drains now. If the anchor came
    // from `Date.now()` at the drain, the whole trace would slide to the
    // reconnection — so this assertion is the one that pins the design.
    const ok = await sendOutboxEntry({
      kind: 'progress',
      activityId: 'act-live',
      passed: false,
      response: 'o distrator',
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    expect(ok).toBe(true);
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).toMatchObject({
      activity_id: 'act-live',
      started_at: OPENED_AT,
    });
  });

  it('a legacy queued entry (no settledAt) still records the attempt, with no trace', async () => {
    const ok = await sendOutboxEntry({
      kind: 'progress',
      activityId: 'act-old',
      passed: true,
      response: null,
      duration: DURATION,
    });

    expect(ok).toBe(true);
    expect(inserts['activity_results']).toHaveLength(1);
    expect(traces()).toHaveLength(0);
  });
});

describe('a telemetria nunca derruba o dado que ela existe pra enriquecer', () => {
  it('still records the attempt and reports success when activity_traces does not exist', async () => {
    // The deploy window: build live, migration 0034 not applied yet.
    errorFor = (t) =>
      t === 'activity_traces' ? { message: 'relation "activity_traces" does not exist' } : null;

    const ok = await persistActivityProgress('act-1', {
      passed: true,
      response: 'A',
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    expect(ok).toBe(true);
    expect(inserts['activity_results']).toHaveLength(1);
    expect(inserts['activity_results'][0]).toMatchObject({ passed: true, elapsed_ms: 8_000 });
  });

  it('survives a trace write that THROWS rather than returning an error', async () => {
    throwsFor = 'activity_traces';
    const ok = await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(ok).toBe(true);
    expect(inserts['activity_results']).toHaveLength(1);
  });

  it('the trace is a SEPARATE statement, so it cannot poison the attempt insert', async () => {
    // The structural property: `activity_results` is written to completion
    // before `activity_traces` is touched at all. That is what makes the 0033
    // re-insert seatbelt unnecessary here rather than merely absent.
    throwsFor = 'activity_traces';
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(inserts['activity_results']).toHaveLength(1);
    expect(inserts['activity_results'][0]).toMatchObject({ elapsed_ms: 8_000 });
  });

  it('keeps the 0033 seatbelt intact: a rejected attempt insert still re-inserts', async () => {
    let first = true;
    errorFor = (t) => {
      if (t !== 'activity_results') return null;
      if (first) {
        first = false;
        return { message: 'column "elapsed_ms" does not exist' };
      }
      return null;
    };

    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    const [timed, fallback] = inserts['activity_results'];
    expect(timed).toHaveProperty('elapsed_ms', 8_000);
    expect(fallback).not.toHaveProperty('elapsed_ms');
    // And the trace is still written — the older schema simply has no column
    // for the timing, which says nothing about whether it has the trace table.
    expect(traces()).toHaveLength(1);
  });
});
