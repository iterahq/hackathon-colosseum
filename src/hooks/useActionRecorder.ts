/**
 * The recording seam — how a family's actions leave the activity.
 *
 * Plan `20260731-itera-padroes-reducer-atividades`, the wiring half of Fase A:
 * the families are named in `src/utils/activityFamilies.ts`; this is the one
 * way their actions reach `itera.activity_traces`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUR PROPERTIES, AND WHY EACH ONE IS NOT NEGOTIABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **ZERO RE-RENDERS.** The buffer is a `useRef`, never state. Telemetry that
 *    re-renders the activity on every click would change the thing it measures,
 *    and on a slow classroom Chromebook it would be felt.
 *
 * 2. **NOTHING HERE MAY THROW.** `record` and `drain` are wrapped, and a
 *    failure costs the trace and nothing else. Both are called from inside
 *    `onClick` and `handleSubmit`, i.e. ON the learner's critical path — the
 *    one place the parent plan says instrumentation must never be. The rest of
 *    the pipeline earns that property by construction (the trace is a separate
 *    INSERT into a separate table, after the attempt has landed); this module
 *    is the one part that sits upstream of the answer, so it buys the same
 *    property with a `try`.
 *
 * 3. **THE FAMILY IS A TYPE PARAMETER.** `record` accepts only
 *    `FamilyAction<F>`, so a `selection` activity CANNOT record `pair_made` —
 *    it does not compile. That is the mechanical half of the Fase A claim that
 *    families own their vocabularies; the prose half is in `activityFamilies.ts`.
 *
 * 4. **THE AUTHOR HARNESS STAYS WRITE-FREE.** Recording produces a value and
 *    hands it UP through `onComplete(correct, { actions })`. Only the
 *    learner-facing players persist. `ActivityTestHarness` mounts the very same
 *    components and deliberately imports nothing from `progress.service`, so a
 *    curator exercising an activity fills a buffer that is then discarded —
 *    exactly like the `response` and `artifact` channels it rides beside.
 *    ⚠️ Do NOT "improve" this by having the recorder write directly. Curator
 *    traffic inside a learner attempt log is not extra data, it is corrupted
 *    data, and it is not separable afterwards.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The buffer stops at `MAX_TRACE_ACTIONS` and keeps the HEAD, because the head
 * is where the strategy is (what the learner tried FIRST). The terminal action
 * is not at risk here — `buildAttemptTrace` appends it after the cut. Dropping
 * the tail silently is acceptable for the same reason the trace as a whole is
 * best-effort; losing the learner's answer would not be.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ActivityFamily, FamilyAction } from '@/utils/activityFamilies';
import { MAX_TRACE_ACTIONS, type RecordedAction } from '@/utils/learningTrace';

export interface ActionRecorder<F extends ActivityFamily> {
  /**
   * Note that the learner did something. Stamped `Date.now()` — wall clock,
   * rebased against the trace origin later (see `RecordedAction`).
   */
  record: (type: FamilyAction<F>, payload?: Record<string, unknown>) => void;
  /**
   * Take the sequence and clear the buffer. Called once, at submit, and handed
   * up in `ActivityCompleteDetail.actions`.
   *
   * Clearing matters: a kind that can settle twice (the sandbox family re-fires
   * `onComplete` from a mount effect when it reads itself as done) must not
   * hand the same actions up a second time and have them counted twice.
   */
  drain: () => RecordedAction[];
}

/**
 * @param family the activity's family. Type parameter AND runtime value — it is
 *   what narrows `record`.
 * @param resetKey the activity id. Changing it clears the buffer, matching the
 *   repo's `reset on [activity.id]` pattern: moving between activities must
 *   never let one attempt's actions leak into the next one's trace.
 */
export function useActionRecorder<F extends ActivityFamily>(
  family: F,
  resetKey: string
): ActionRecorder<F> {
  // `family` is not read at runtime today — it is here so the call site states
  // which vocabulary it is committing to, and so the generic can be inferred
  // from an argument rather than written out at every call.
  void family;

  const bufferRef = useRef<RecordedAction[]>([]);

  useEffect(() => {
    bufferRef.current = [];
  }, [resetKey]);

  const record = useCallback((type: FamilyAction<F>, payload?: Record<string, unknown>) => {
    try {
      const buffer = bufferRef.current;
      if (buffer.length >= MAX_TRACE_ACTIONS) return;
      buffer.push({ type, at: Date.now(), ...(payload ? { payload } : {}) });
    } catch {
      // Best-effort by design: a trace is worth less than the click that
      // produced it, and this runs inside the learner's own onClick.
    }
  }, []);

  const drain = useCallback(() => {
    try {
      const taken = bufferRef.current;
      bufferRef.current = [];
      return taken;
    } catch {
      return [];
    }
  }, []);

  return { record, drain };
}
