/**
 * The recording seam, as the Itera Player types it.
 *
 * The IMPLEMENTATION moved to `@iterahq/activities` in Fase C — it is
 * activity-level (a ref buffer that lives for one attempt and is drained at
 * submit), not player-level, and the extracted choice/ordering kinds need it.
 * See the package's `internal/actionRecorder.ts` for the four properties it
 * must keep (zero re-renders · never throws · vocabulary is a type parameter ·
 * recording never writes) and why each one is not negotiable.
 *
 * WHAT STAYS HERE IS THE TYPE, AND THAT IS THE WHOLE POINT OF THE FILE.
 * `FamilyAction<F>` comes from `src/utils/activityFamilies.ts`, the taxonomy
 * that says a `selection` activity may not record `pair_made`. That taxonomy is
 * Itera's telemetry model — the package must not carry it, or every consumer
 * would inherit Itera's event vocabulary — so the package's recorder is generic
 * over a plain string union and this wrapper binds it to the family.
 *
 * The two are kept honest by `src/test/activityTraceVocabulary.test.ts`, which
 * asserts the action names the PACKAGE emits are a subset of the ones this
 * taxonomy declares for the same family. Without it, a rename on either side
 * would produce actions the replay cannot interpret, silently.
 */
import { useActivityActionRecorder, type ActivityRecordedAction } from '@iterahq/activities';
import type { ActivityFamily, FamilyAction } from '@/utils/activityFamilies';
import type { RecordedAction } from '@/utils/learningTrace';

export interface ActionRecorder<F extends ActivityFamily> {
  /** Note that the learner did something. Stamped `Date.now()`. */
  record: (type: FamilyAction<F>, payload?: Record<string, unknown>) => void;
  /** Take the sequence and clear the buffer. Called once, at submit. */
  drain: () => RecordedAction[];
}

/**
 * @param family the activity's family. Type parameter AND runtime value — it is
 *   what narrows `record`. Not read at runtime (the package's recorder does not
 *   need it); it is here so the call site states which vocabulary it commits to.
 * @param resetKey the activity id. Changing it clears the buffer.
 */
export function useActionRecorder<F extends ActivityFamily>(
  family: F,
  resetKey: string,
): ActionRecorder<F> {
  void family;
  const recorder = useActivityActionRecorder<FamilyAction<F>>(resetKey);
  return recorder as unknown as ActionRecorder<F>;
}

export type { ActivityRecordedAction };
