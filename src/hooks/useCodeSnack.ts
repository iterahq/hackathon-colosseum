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
   * Report the REAL outcome upward, WITH the source the learner settled on.
   * With checks the verdict is "did every check pass"; without checks it stays
   * the old unconditional `true` (an ungraded snack has nothing to be wrong
   * about). This is what turns `itera.class_answers.correct` — today always
   * `true` for code — into real data for the post-class report and the podium.
   *
   * ═════════════════════════════════════════════════════════════════════════
   * WHY THE SOURCE RIDES UP HERE — the gap this closes
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Until now `code` reported a bare boolean and the learner's work existed in
   * exactly ONE place: `localStorage`, via `codeSnapshot.service`. It never left
   * the machine. Measured on 2026-08-03: of 556 attempt rows only 29 (5%) carry
   * any `response` at all, and NOT ONE of them is a code attempt — the kind
   * where *"how did they get there"* is the entire question.
   *
   * A cleared cache, a different browser, a borrowed Chromebook, and the work is
   * gone with no record that it ever existed. That loss is not recoverable
   * later, which is the same argument the whole telemetry plan rests on.
   *
   * 🔑 THE DRAFT STAYS LOCAL. This does NOT move autosave to the server: the
   * debounced snapshot keeps writing to `localStorage` exactly as before, so a
   * refresh mid-exercise still restores from the machine and nothing about the
   * editing loop changes. What leaves is the SETTLED submission only — the same
   * moment, and the same channel (`ActivityCompleteDetail.response`), that
   * `single_choice`, `order`, `match` and `document` have used since PR #193.
   *
   * ⚠️ AND IT IS NOT A WRITE. Handing the source up persists nothing on its own:
   * only the learner-facing players call the persistence path, which is the
   * boundary that keeps `ActivityTestHarness` from turning a curator's typing
   * into learner data. What the players then do with it:
   *   · `activity_results.feedback.response`, capped at `MAX_RESPONSE_CHARS`
   *     (2000) and marked when truncated — the instructor-facing attempt log;
   *   · an `itera.artifacts` row, because `KIND_ARTIFACT_DEFAULTS.code` is
   *     already `persist: true` and says in its own comment *"not yet WIRED …
   *     the default is correct in advance so that wiring it later is one call
   *     site, not another policy decision"*. This is that call site.
   *
   * Both destinations are RLS'd to the learner (`results_rw_self`,
   * `artifacts_rw_self`) with the pre-existing admin/instructor read policies —
   * no new table, no new policy, no new grant.
   */
  const complete = useCallback(() => {
    if (!hasChecks) {
      onComplete(true, { response: code });
      return;
    }
    if (results === null) return;
    settle();
    onComplete(allPassed, { response: code });
  }, [hasChecks, results, allPassed, settle, onComplete, code]);

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
