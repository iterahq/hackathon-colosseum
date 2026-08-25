import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCheck } from '@iterahq/activity-spec';
import type { CodeCheckResult, CodeChecksRequest, CodeSnackPhase } from './types.js';

/**
 * How long we wait for the preview iframe to answer a check run before giving
 * up. It can only go silent if it crashed or never booted; a submit that hangs
 * forever mid-class is worse than one that comes back "não passou" with a retry
 * available.
 */
const CHECKS_TIMEOUT_MS = 8000;

/**
 * The submit → verdict → retry lifecycle of a graded code snack.
 *
 * The correction itself does NOT run here: it runs inside the preview iframe
 * against the rendered DOM (see `./codePreviewRuntime.ts`). This hook only
 * asks for a run (`checksRequest`, consumed by the preview component), receives
 * the verdicts, and derives the phase.
 */
export function useCodeChecks(code: string, checks: CodeCheck[]) {
  const [phase, setPhase] = useState<CodeSnackPhase>('editing');
  const [results, setResults] = useState<CodeCheckResult[] | null>(null);
  const [checksRequest, setChecksRequest] = useState<CodeChecksRequest | null>(null);
  /**
   * The exact source the current `results` were produced from. A verdict belongs
   * to ONE version of the code, not to the activity — without this, editing
   * after a submit kept the old (green) verdict alive and the class saw broken
   * code marked as correct (Arthur, call de líderes 2026-07-28).
   */
  const [gradedCode, setGradedCode] = useState<string | null>(null);
  /**
   * Este veredito veio do preview ou do cronômetro?
   *
   * A diferença passou a valer dinheiro quando o envio ficou limitado: um
   * preview que não bootou reprova TUDO, e cobrar uma vida por isso tira do
   * aluno uma tentativa que ele nunca teve. Quem lê é `useCodeSnack`, que só
   * debita quando a reprovação veio de código de verdade.
   */
  const [timedOut, setTimedOut] = useState(false);
  const tokenRef = useRef(0);

  // Leaving the window where a verdict is welcome invalidates the run in flight.
  // Bumping the token IS the invalidation: a slow iframe answering the previous
  // submit lands with a stale token and is dropped instead of overwriting.
  const reset = useCallback(() => {
    tokenRef.current += 1;
    setPhase('editing');
    setResults(null);
    setChecksRequest(null);
    setGradedCode(null);
    setTimedOut(false);
  }, []);

  const settle = useCallback(() => {
    tokenRef.current += 1;
    setPhase('settled');
  }, []);

  // If the source moves away from what was graded, the verdict leaves with it —
  // a reopened editor is far better than a green badge over code nobody graded.
  useEffect(() => {
    if (gradedCode === null || code === gradedCode || phase === 'settled') return;
    reset();
  }, [code, gradedCode, phase, reset]);

  // Safety net for a preview that never answers: fall back to "nothing passed"
  // so the learner still gets feedback + a retry instead of a dead button.
  useEffect(() => {
    if (phase !== 'submitting') return;
    const id = setTimeout(() => {
      setResults(checks.map((c) => ({ id: c.id, passed: false })));
      setTimedOut(true);
      setPhase('submitted');
    }, CHECKS_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, checks]);

  /** Ask the preview to render the submitted source and grade it. */
  const submit = useCallback(() => {
    if (phase !== 'editing' || checks.length === 0) return;
    tokenRef.current += 1;
    setResults(null);
    setGradedCode(code);
    setTimedOut(false);
    setPhase('submitting');
    setChecksRequest({ token: tokenRef.current, code, checks });
  }, [phase, code, checks]);

  /** The preview answered — settle the feedback screen. */
  const receiveResults = useCallback(
    (incoming: CodeCheckResult[], token: number) => {
      // A run slower than the timeout lands after the learner already retried:
      // its verdict describes a version of the code that is no longer on screen.
      if (token !== tokenRef.current) return;
      setPhase('submitted');
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

  const allPassed = useMemo(
    () => results !== null && results.length > 0 && results.every((r) => r.passed),
    [results],
  );

  return {
    phase,
    results,
    allPassed,
    timedOut,
    checksRequest,
    submit,
    receiveResults,
    reset,
    settle,
  };
}
