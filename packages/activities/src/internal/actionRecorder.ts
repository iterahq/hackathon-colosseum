/**
 * The recording seam — how the ORDERED SEQUENCE of what a learner did leaves an
 * activity.
 *
 * Moved here from the app's `src/hooks/useActionRecorder.ts` (which is now a
 * typed wrapper over this) because it is activity-level, not player-level: the
 * buffer lives for one attempt, is drained by the kind at submit, and is handed
 * UP through `onComplete(correct, { actions })`. Nothing in it knows about the
 * Itera trace pipeline — the host decides whether an attempt sequence becomes a
 * row in `itera.activity_traces`, a `console.log`, or nothing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FOUR PROPERTIES, PRESERVED VERBATIM FROM THE APP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **ZERO RE-RENDERS.** The buffer is a `useRef`, never state. Telemetry that
 *    re-rendered the activity on every click would change the thing it measures,
 *    and on a slow classroom Chromebook it would be felt.
 *
 * 2. **NOTHING HERE MAY THROW.** `record` and `drain` are wrapped; a failure
 *    costs the trace and nothing else. Both are called from inside `onClick`
 *    and `handleSubmit`, i.e. ON the learner's critical path.
 *
 * 3. **THE VOCABULARY IS A TYPE PARAMETER.** `record` accepts only `A`, so a
 *    selection kind cannot record `pair_made` — it does not compile. In the app
 *    that parameter is `FamilyAction<F>`, derived from the family taxonomy; in
 *    the package it is the literal union the kind declares. The two are kept in
 *    step mechanically by `src/test/activityTraceVocabulary.test.ts`.
 *
 * 4. **RECORDING NEVER WRITES.** It produces a value and hands it up. The
 *    author test harness mounts the very same components and discards what it
 *    collects. ⚠️ Do NOT "improve" this by having the recorder write directly:
 *    curator traffic inside a learner attempt log is not extra data, it is
 *    corrupted data, and it is not separable afterwards.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAP
 * ═══════════════════════════════════════════════════════════════════════════
 * The buffer stops at `MAX_ACTIVITY_ACTIONS` and keeps the HEAD, because the
 * head is where the strategy is (what the learner tried FIRST). The terminal
 * action is not at risk — the host's trace builder appends it after the cut.
 */
import { useCallback, useEffect, useRef } from 'react';

/**
 * One thing the learner did, stamped with the WALL CLOCK.
 *
 * Absolute `Date.now()` rather than an offset: the activity does not know the
 * trace origin, and giving it the host's clock to find out would be a coupling
 * for a value that is one subtraction away. The host rebases.
 *
 * `type` is `string` here and a literal union in the host (the Itera Player
 * narrows it to `LearnerActionType`). The package cannot narrow it without
 * importing the host's taxonomy, which is exactly the coupling being removed.
 */
export interface ActivityRecordedAction {
  type: string;
  /** Wall clock (`Date.now()`) at the moment the learner did this. */
  at: number;
  /** Type-specific detail. NEVER free text. */
  payload?: Record<string, unknown>;
}

/**
 * Buffer cap. Same value the app used (`MAX_TRACE_ACTIONS`), and it has to stay
 * the same value — `src/test/activityTraceVocabulary.test.ts` asserts it.
 */
export const MAX_ACTIVITY_ACTIONS = 500;

export interface ActivityActionRecorder<A extends string> {
  /** Note that the learner did something. */
  record: (type: A, payload?: Record<string, unknown>) => void;
  /**
   * Take the sequence and clear the buffer. Called once, at submit.
   *
   * Clearing matters: a kind that can settle twice must not hand the same
   * actions up a second time and have them counted twice.
   */
  drain: () => ActivityRecordedAction[];
}

/**
 * @param resetKey the activity id. Changing it clears the buffer — moving
 *   between activities must never let one attempt's actions leak into the
 *   next one's trace.
 */
export function useActivityActionRecorder<A extends string>(
  resetKey: string,
): ActivityActionRecorder<A> {
  const bufferRef = useRef<ActivityRecordedAction[]>([]);

  useEffect(() => {
    bufferRef.current = [];
  }, [resetKey]);

  const record = useCallback((type: A, payload?: Record<string, unknown>) => {
    try {
      const buffer = bufferRef.current;
      if (buffer.length >= MAX_ACTIVITY_ACTIONS) return;
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

/**
 * The action names the package's OWN kinds emit, grouped the way the Itera
 * Player groups them.
 *
 * Exported for one reason and it is not consumer convenience: the app's
 * `FAMILY_ACTIONS` taxonomy still owns the narrow type, and a copy nobody
 * checks is how two vocabularies diverge. `src/test/activityTraceVocabulary.test.ts`
 * asserts these are a SUBSET of the app's map, per family, so a rename on
 * either side turns red instead of silently writing an action name the host's
 * replay cannot interpret.
 */
export const ACTIVITY_TRACE_ACTIONS = {
  selection: ['option_selected', 'option_deselected', 'answer_submitted'],
  arrangement: [
    'item_moved',
    'pair_armed',
    'pair_made',
    'pair_broken',
    'answer_submitted',
  ],
  // Added in Fase C step 4, with the sandbox. Only the TERMINAL sandbox
  // emits today; the chat sandbox is deliberately silent (see the ledger note
  // on `FAMILY_EMITTED.scenario` in the Player's `activityFamilies.ts`). The
  // asymmetry travels with the code rather than being re-discovered here.
  scenario: ['command_run', 'sandbox_reset'],
  // `inquiry` — the NON-GRADING ask (`question`, 2026-08-28).
  //
  // ⚠️ IT DOES NOT REUSE `option_selected` / `option_deselected`, AND THAT IS
  // ENFORCED RATHER THAN PREFERRED. The Player's `activityFamilies.test.ts`
  // asserts that `answer_submitted` is the ONLY action name shared between two
  // families, on the grounds that a second shared name means the two families
  // are one machine wearing two labels.
  //
  // These genuinely are two machines. In `selection` the person marks the
  // option they believe is CORRECT and the reducer holds a verdict. Here they
  // state a position: there is nothing to be right about, the answer may be
  // prose instead of an option, and no verdict is ever computed. `marked` says
  // *this is part of my answer*; `selected` says *I think this is the one*.
  //
  // `note_edited` carries `{ length }` and NEVER the text — the same shape
  // `code_edited` uses, under the same `PAYLOADS_CARRY_NO_FREE_TEXT` rule.
  // `reading` — the scene kinds (`xray`, `live_type`, `inspect`, 2026-09-24).
  // `element_found` carries `{ element_id }` (an AUTHORED id); `text_edited`
  // carries `{ length }` and NEVER the text (`live_type` is the only one that
  // takes typing); `gate_opened` marks the gesture that completed the beat.
  reading: ['element_found', 'text_edited', 'gate_opened'],
  inquiry: [
    'option_marked',
    'option_unmarked',
    'other_toggled',
    'note_edited',
    'answer_submitted',
  ],
} as const;

export type SelectionAction = (typeof ACTIVITY_TRACE_ACTIONS)['selection'][number];
export type ArrangementAction = (typeof ACTIVITY_TRACE_ACTIONS)['arrangement'][number];
export type ScenarioAction = (typeof ACTIVITY_TRACE_ACTIONS)['scenario'][number];
export type InquiryAction = (typeof ACTIVITY_TRACE_ACTIONS)['inquiry'][number];
export type ReadingAction = (typeof ACTIVITY_TRACE_ACTIONS)['reading'][number];
