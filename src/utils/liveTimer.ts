import type { ClassTimer } from '@/types/liveClass';

/** Validate a `timer` broadcast payload into a ClassTimer, or null if malformed. */
export function parseTimerEvent(payload: unknown): ClassTimer | null {
  const p = payload as { activity_id?: unknown; deadline?: unknown } | null;
  if (!p || typeof p.activity_id !== 'string' || typeof p.deadline !== 'number') return null;
  return { activityId: p.activity_id, deadline: p.deadline };
}

/**
 * The timer state after a `timer-stop` payload: clears only when it targets the
 * currently-running activity's timer, so a stray stop for another activity can't
 * kill the live one.
 */
export function timerAfterStop(current: ClassTimer | null, payload: unknown): ClassTimer | null {
  const p = payload as { activity_id?: unknown } | null;
  if (!p || typeof p.activity_id !== 'string') return current;
  return current && current.activityId === p.activity_id ? null : current;
}
