import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { saveCodeSnapshot } from '@/services/codeSnapshot.service';
import type {
  CodeCheckResult,
  CodeChecksRequest,
  CodeSnackPhase,
  UseCodeSnackCallbacks,
} from '@/types/codeSnack';

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * How long we wait for the preview iframe to answer a check run before giving
 * up. It can only go silent if it crashed or never booted; a submit that hangs
 * forever mid-class is worse than one that comes back "não passou" with a retry
 * available.
 */
const CHECKS_TIMEOUT_MS = 8000;

/**
 * Owns the code-snack's editable source, debounced autosave, and — when the
 * spec ships `checks` — the submit/feedback/retry lifecycle.
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
  const [code, setCode] = useState(spec.starter ?? '');
  const [phase, setPhase] = useState<CodeSnackPhase>('editing');
  const [results, setResults] = useState<CodeCheckResult[] | null>(null);
  const [checksRequest, setChecksRequest] = useState<CodeChecksRequest | null>(null);
  const tokenRef = useRef(0);

  const checks = useMemo(() => spec.checks ?? [], [spec.checks]);
  const hasChecks = checks.length > 0;

  const persist = useCallback(
    (next: string) => {
      if (onAutosave) onAutosave(next);
      else saveCodeSnapshot(activityId, next);
    },
    [activityId, onAutosave],
  );

  // Reset to the seed when the activity changes (golden pattern: reset on [activity.id]).
  useEffect(() => {
    setCode(spec.starter ?? '');
    setPhase('editing');
    setResults(null);
    setChecksRequest(null);
  }, [activityId, spec.starter]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
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
    complete,
  };
}
