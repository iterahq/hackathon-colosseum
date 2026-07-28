import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import {
  clearCodeSnapshot,
  readCodeSnapshot,
  saveCodeSnapshot,
} from '@/services/codeSnapshot.service';
import type { UseCodeSnackCallbacks } from '@/types/codeSnack';
import { useCodeChecks } from './useCodeChecks';

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * What the editor opens with: the learner's OWN saved work when there is any,
 * the authored starter otherwise.
 *
 * `readCodeSnapshot` swallows a broken/blocked storage and answers `null`, so a
 * browser in private mode simply falls back to the starter — an activity must
 * never fail to open because localStorage said no.
 */
function seedFor(activityId: string, starter: string | undefined): string {
  return readCodeSnapshot(activityId)?.code ?? starter ?? '';
}

/**
 * Owns the code-snack's editable source and its persistence (autosave AND
 * restore), and — when the spec ships `checks` — hands the submit/feedback/retry
 * lifecycle to `useCodeChecks`.
 *
 * Retrocompatibility is deliberate: with no checks the hook behaves exactly as
 * before — `complete()` reports `true` and the learner just clicks Concluir.
 */
export function useCodeSnack(
  activityId: string,
  spec: CodeSpec,
  callbacks: UseCodeSnackCallbacks,
) {
  const { onComplete, onAutosave } = callbacks;
  // Lazy init, on purpose: reading the snapshot INSIDE `useState` means the very
  // first paint already shows the learner's work. Seeding with the starter and
  // swapping it in an effect would flash the starter — mid-class that reads as
  // "my code is gone" even when it comes back a frame later.
  const [code, setCodeState] = useState(() => seedFor(activityId, spec.starter));
  /**
   * Has the learner actually touched THIS activity's source? Only their own
   * edits deserve a snapshot. Without this flag the debounce would write the
   * seed back one tick after every mount — which would (a) resurrect the code a
   * reset just discarded and (b) tell the professor "em andamento" about someone
   * who merely opened the screen.
   */
  const touchedRef = useRef(false);

  const checks = useMemo(() => spec.checks ?? [], [spec.checks]);
  const hasChecks = checks.length > 0;
  const { phase, results, allPassed, checksRequest, submit, receiveResults, reset, settle } =
    useCodeChecks(code, checks);

  /** The editor's onChange — every learner-originated edit comes through here. */
  const setCode = useCallback((next: string) => {
    touchedRef.current = true;
    setCodeState(next);
  }, []);

  const persist = useCallback(
    (next: string) => {
      if (onAutosave) onAutosave(next);
      else saveCodeSnapshot(activityId, next);
    },
    [activityId, onAutosave],
  );

  // Re-seed when the activity changes (golden pattern: reset on [activity.id]).
  // Note this SEEDS rather than resets: it reads the new activity's own saved
  // work, so moving back and forth between activities never crosses their code.
  useEffect(() => {
    touchedRef.current = false;
    setCodeState(seedFor(activityId, spec.starter));
    reset();
  }, [activityId, spec.starter, reset]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!touchedRef.current) return;
    timerRef.current = setTimeout(() => persist(code), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, persist]);

  /**
   * "Recomeçar do código inicial" — the OPPOSITE of `retry`, and the two must
   * never be collapsed into one control (Tainan, 2026-07-23): retry keeps the
   * work, this one throws it away on purpose, for the learner who broke the
   * starter so badly that they cannot get back into the class.
   *
   * The saved snapshot is dropped too. Keeping it would make the next reload
   * hand back exactly what they just chose to discard, and would leave the
   * professor's stage projecting a draft the learner has abandoned.
   */
  const resetToStarter = useCallback(() => {
    touchedRef.current = false;
    clearCodeSnapshot(activityId);
    setCodeState(spec.starter ?? '');
    reset();
  }, [activityId, spec.starter, reset]);

  /**
   * Report the REAL outcome upward. With checks that is "did every check pass";
   * without checks it stays the old unconditional `true` (an ungraded snack has
   * nothing to be wrong about). This is what turns `itera.class_answers.correct`
   * — today always `true` for code — into real data for the post-class report
   * and the podium.
   */
  const complete = useCallback(() => {
    if (!hasChecks) {
      onComplete(true);
      return;
    }
    if (results === null) return;
    settle();
    onComplete(allPassed);
  }, [hasChecks, results, allPassed, settle, onComplete]);

  return {
    code,
    setCode,
    phase,
    results,
    allPassed,
    hasChecks,
    /** The source is frozen while a verdict is on screen. */
    readOnly: hasChecks && phase !== 'editing',
    checksRequest,
    submit,
    receiveResults,
    /**
     * "Tentar de novo" / "Editar de novo" — back to editing WITHOUT touching the
     * learner's code. Explicitly NOT a reset: re-seeding from `spec.starter`
     * would throw away the work they just did, which is the opposite of what a
     * retry means. Dropping the verdict is what makes reopening safe.
     */
    retry: reset,
    resetToStarter,
    complete,
  };
}
