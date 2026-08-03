import { describe, it, expect } from 'vitest';
import {
  maxMirroredRoomSize,
  REALTIME_CEILING_MSGS_PER_SEC,
  stageCursorPlan,
  STAGE_CURSOR_BUDGET_MSGS_PER_SEC,
  STAGE_CURSOR_MAX_HZ,
  STAGE_CURSOR_MIN_HZ,
} from '@/utils/stageCursorRate';

/**
 * The cost model of the cursor mirror, as a test.
 *
 * The number that matters is not the emission rate — it is `hz × (roomSize + 1)`
 * against a project-wide ceiling of 100 msgs/s on the Free tier, where going
 * over DISCONNECTS clients instead of slowing them down. The whole reason the
 * rate is derived rather than configured is that no fixed value is safe at
 * every room size, so this file pins the property "never over budget, for any
 * room" rather than a handful of examples.
 */
describe('stageCursorPlan — the cost invariant', () => {
  it('never exceeds the budget, for ANY room size', () => {
    for (let room = 1; room <= 500; room++) {
      const plan = stageCursorPlan(room);
      expect(plan.costMsgsPerSec).toBeLessThanOrEqual(STAGE_CURSOR_BUDGET_MSGS_PER_SEC);
      // …and therefore never near the ceiling that actually drops clients.
      expect(plan.costMsgsPerSec).toBeLessThan(REALTIME_CEILING_MSGS_PER_SEC);
    }
  });

  it('leaves real headroom for the rest of Realtime', () => {
    // The budget is a deliberate minority of the ceiling: stage-update /
    // stage-show, answered, advance, timer, presence and a concurrent class all
    // draw on the same 100/s.
    expect(STAGE_CURSOR_BUDGET_MSGS_PER_SEC).toBeLessThanOrEqual(
      REALTIME_CEILING_MSGS_PER_SEC * 0.6
    );
  });

  it('never emits faster than the answered Q4 ceiling', () => {
    for (let room = 1; room <= 500; room++) {
      expect(stageCursorPlan(room).hz).toBeLessThanOrEqual(STAGE_CURSOR_MAX_HZ);
    }
  });

  it('degrades monotonically — a bigger room is never given a faster rate', () => {
    let previous = Infinity;
    for (let room = 1; room <= 200; room++) {
      const { hz } = stageCursorPlan(room);
      expect(hz).toBeLessThanOrEqual(previous);
      previous = hz;
    }
  });
});

describe('stageCursorPlan — the table it replaces', () => {
  /**
   * The fixed-5 Hz table from the plan, and what the adaptive rate does instead.
   * `fixed5` is what a "5 Hz + max 20 people" design would have put on the wire:
   * the 20-person row is 105 msgs/s, i.e. over the Free ceiling — which is the
   * finding that killed the fixed cap.
   */
  const rows: { room: number; fixed5: number; hz: number }[] = [
    { room: 5, fixed5: 30, hz: 5 },
    { room: 10, fixed5: 55, hz: 5 },
    { room: 11, fixed5: 60, hz: 5 },
    { room: 12, fixed5: 65, hz: 4 },
    { room: 15, fixed5: 80, hz: 3 },
    { room: 20, fixed5: 105, hz: 2 },
    { room: 29, fixed5: 150, hz: 2 },
  ];

  it.each(rows)('room of $room → $hz Hz (fixed 5 Hz would bill $fixed5/s)', ({ room, fixed5, hz }) => {
    const plan = stageCursorPlan(room);
    expect(5 * (room + 1)).toBe(fixed5);
    expect(plan.hz).toBe(hz);
    expect(plan.enabled).toBe(true);
    expect(plan.costMsgsPerSec).toBe(hz * (room + 1));
  });

  it('answers the "does 20 fit at 5 Hz?" question with a hard no', () => {
    expect(5 * (20 + 1)).toBeGreaterThan(REALTIME_CEILING_MSGS_PER_SEC);
  });

  it("gives today's rooms the full rate", () => {
    // Rooms are ~5 people today; nothing about the adaptive design costs them
    // anything.
    expect(stageCursorPlan(5).hz).toBe(STAGE_CURSOR_MAX_HZ);
    expect(stageCursorPlan(5).costMsgsPerSec).toBe(30);
  });
});

describe('stageCursorPlan — the floor', () => {
  it('switches the mirror OFF rather than stuttering below the floor', () => {
    const off = stageCursorPlan(maxMirroredRoomSize() + 1);
    expect(off.enabled).toBe(false);
    expect(off.hz).toBe(0);
    expect(off.costMsgsPerSec).toBe(0);
    expect(off.intervalMs).toBe(Infinity);
  });

  it('mirrors right up to the boundary and not past it', () => {
    const max = maxMirroredRoomSize();
    expect(max).toBe(29);
    expect(stageCursorPlan(max).enabled).toBe(true);
    expect(stageCursorPlan(max).hz).toBe(STAGE_CURSOR_MIN_HZ);
    expect(stageCursorPlan(max + 1).enabled).toBe(false);
  });

  it('is stated in terms of the budget, not a magic constant', () => {
    expect(maxMirroredRoomSize(40)).toBe(19);
    expect(maxMirroredRoomSize(100)).toBe(49);
  });
});

describe('stageCursorPlan — degenerate input', () => {
  it.each([0, -3, NaN, Infinity])('treats %s as a room of one', (room) => {
    const plan = stageCursorPlan(room as number);
    expect(plan.costPerEvent).toBe(2);
    expect(plan.hz).toBe(STAGE_CURSOR_MAX_HZ);
  });
});
