import { describe, it, expect } from 'vitest';
import { computeLiveSignal } from '@/components/branded/LiveClassSignal';

// loop-2 fix #6 — app-wide "a class went live" signal fires ONCE per session
// transition, never on every poll/re-render, and never when already on /live/*.
describe('computeLiveSignal (once-per-transition)', () => {
  const S1 = 'session-1';
  const S2 = 'session-2';

  it('fires on the null → live transition (fresh session, off the live route)', () => {
    const r = computeLiveSignal({ activeId: S1, signaledId: null, onLiveRoute: false });
    expect(r).toEqual({ fire: true, nextSignaledId: S1 });
  });

  it('does NOT fire again for the same session id (idempotent per session)', () => {
    // second evaluation with the same active id already signaled
    const r = computeLiveSignal({ activeId: S1, signaledId: S1, onLiveRoute: false });
    expect(r.fire).toBe(false);
    expect(r.nextSignaledId).toBe(S1);
  });

  it('does NOT fire when the user is already on a /live/* route', () => {
    const r = computeLiveSignal({ activeId: S1, signaledId: null, onLiveRoute: true });
    expect(r.fire).toBe(false);
    // …but it still marks the session as signaled so it never toasts once they leave.
    expect(r.nextSignaledId).toBe(S1);
  });

  it('does NOT fire when there is no active session, and retains the last id', () => {
    const r = computeLiveSignal({ activeId: null, signaledId: S1, onLiveRoute: false });
    expect(r).toEqual({ fire: false, nextSignaledId: S1 });
  });

  it('fires again for a DIFFERENT (new) session id', () => {
    const r = computeLiveSignal({ activeId: S2, signaledId: S1, onLiveRoute: false });
    expect(r).toEqual({ fire: true, nextSignaledId: S2 });
  });

  it('same session reappearing after a null blip does NOT re-fire', () => {
    // live S1 → signaled; goes null (blip) → retains S1; S1 comes back → no re-toast.
    let state: string | null = null;
    let step = computeLiveSignal({ activeId: S1, signaledId: state, onLiveRoute: false });
    expect(step.fire).toBe(true);
    state = step.nextSignaledId;

    step = computeLiveSignal({ activeId: null, signaledId: state, onLiveRoute: false });
    expect(step.fire).toBe(false);
    state = step.nextSignaledId;

    step = computeLiveSignal({ activeId: S1, signaledId: state, onLiveRoute: false });
    expect(step.fire).toBe(false);
  });
});
