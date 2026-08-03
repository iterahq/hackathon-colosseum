import type { CodeCheck } from '@iterahq/activity-spec';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';

export interface CodeSnapshot {
  code: string;
  savedAt: string;
}

export interface UseCodeSnackCallbacks {
  /**
   * Report the settled attempt upward. The `detail` carries the learner's SOURCE
   * as `response` — see `useCodeSnack.complete` for why that is the whole point
   * of this signature and not an afterthought.
   */
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  /**
   * Persist a debounced snapshot of the source. Defaults to the local snapshot
   * store (`codeSnapshot.service`).
   *
   * ⚠️ Write-side ONLY. Restoring on open and clearing on "recomeçar" always go
   * to the local snapshot store, so an override that writes somewhere ELSE would
   * hand the learner back the wrong source. If a remote sink is ever needed,
   * move all three (read/write/clear) together instead of overriding just this.
   */
  onAutosave?: (code: string) => void;
}

export interface TranspileResult {
  code?: string;
  error?: string;
}

/** The verdict of ONE deterministic check, as computed inside the preview iframe. */
export interface CodeCheckResult {
  id: string;
  passed: boolean;
}

/**
 * The snack's post-submit lifecycle.
 *
 * `editing` is the ONLY state with a checklist-free screen (editor + live
 * preview, exactly as before). Feedback exists only in `submitted`, and
 * "Tentar de novo" walks straight back to `editing` with the learner's code
 * untouched. `settled` is terminal: the result has been reported upward.
 */
export type CodeSnackPhase = 'editing' | 'submitting' | 'submitted' | 'settled';

/**
 * A request for the preview iframe to (re)render `code` and then evaluate
 * `checks` against the resulting DOM. `token` is what makes a repeated submit
 * of IDENTICAL code re-run the checks — without it the effect would dedupe.
 */
export interface CodeChecksRequest {
  token: number;
  code: string;
  checks: CodeCheck[];
}
