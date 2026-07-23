import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import {
  clearCodeSnapshot,
  readCodeSnapshot,
  saveCodeSnapshot,
} from '@/services/codeSnapshot.service';
import type {
  CodeCheckResult,
  CodeChecksRequest,
  CodeSnackPhase,
  UseCodeSnackCallbacks,
} from '@/types/codeSnack';

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
 * How long we wait for the preview iframe to answer a check run before giving
 * up. It can only go silent if it crashed or never booted; a submit that hangs
 * forever mid-class is worse than one that comes back "não passou" with a retry
 * available.
 */
const CHECKS_TIMEOUT_MS = 8000;

/**
 * Owns the code-snack's editable source, its persistence (autosave AND restore),
 * and — when the spec ships `checks` — the submit/feedback/retry lifecycle.
 *
 * The correction itself does NOT live here: it runs inside the preview iframe
 * against the rendered DOM (see `@/utils/codePreviewRuntime`). This hook only
 * asks for a run (`checksRequest`, consumed by the preview component), receives
 * the verdicts, and derives the phase.
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
  const [phase, setPhase] = useState<CodeSnackPhase>('editing');
  const [results, setResults] = useState<CodeCheckResult[] | null>(null);
  const [checksRequest, setChecksRequest] = useState<CodeChecksRequest | null>(null);
  const tokenRef = useRef(0);
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
    setPhase('editing');
    setResults(null);
    setChecksRequest(null);
  }, [activityId, spec.starter]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!touchedRef.current) return;
    timerRef.current = setTimeout(() => persist(code), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, persist]);

  // Safety net for a preview that never answers: fall back to "nothing passed"
  // so the learner still gets feedback + a retry instead of a dead button.
  useEffect(() => {
    if (phase !== 'submitting') return;
    const id = setTimeout(() => {
      setResults(checks.map((c) => ({ id: c.id, passed: false })));
      setPhase('submitted');
    }, CHECKS_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, checks]);

  /** Ask the preview to render the submitted source and grade it. */
  const submit = useCallback(() => {
    if (!hasChecks || phase !== 'editing') return;
    tokenRef.current += 1;
    setResults(null);
    setPhase('submitting');
    setChecksRequest({ token: tokenRef.current, code, checks });
  }, [hasChecks, phase, code, checks]);

  /** The preview answered — settle the feedback screen. */
  const receiveResults = useCallback(
    (incoming: CodeCheckResult[]) => {
      setPhase((current) => (current === 'submitting' ? 'submitted' : current));
      // The spec's check list drives ORDER and completeness; a check the preview
      // did not report back counts as not passed.
      setResults(
        checks.map((c) => ({
          id: c.id,
          passed: incoming.some((r) => r.id === c.id && r.passed),
        })),
      );
    },
    [checks],
  );

  /**
   * "Tentar de novo" — back to editing WITHOUT touching the learner's code.
   * Explicitly NOT a reset: re-seeding from `spec.starter` would throw away the
   * work they just did, which is the opposite of what a retry means.
   */
  const retry = useCallback(() => {
    setPhase('editing');
    setResults(null);
    setChecksRequest(null);
  }, []);

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
    setPhase('editing');
    setResults(null);
    setChecksRequest(null);
  }, [activityId, spec.starter]);

  const allPassed = useMemo(
    () => results !== null && results.length > 0 && results.every((r) => r.passed),
    [results],
  );

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
    setPhase('settled');
    onComplete(allPassed);
  }, [hasChecks, allPassed, onComplete]);

  return {
    code,
    setCode,
    phase,
    results,
    allPassed,
    hasChecks,
    checksRequest,
    submit,
    receiveResults,
    retry,
    resetToStarter,
    complete,
  };
}
