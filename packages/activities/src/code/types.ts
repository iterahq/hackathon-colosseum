/**
 * The `code` kind's own vocabulary. Internal to the `/code` entrypoint except
 * where `./index.ts` re-exports it.
 *
 * `CodeSnapshot` did NOT come along. It is the shape the Itera Player writes to
 * `localStorage` (`{ code, savedAt }`), i.e. an on-disk envelope belonging to
 * the host's persistence, and the storage port speaks plain strings on purpose:
 * a package that shipped the envelope would be dictating how every consumer
 * stores a draft. It stays in the app, in `src/types/codeSnack.ts`.
 */
import type { CodeCheck } from '@iterahq/activity-spec';
import type { ActivityCompletion } from '../renderer.js';

/**
 * The snack's editable source, plus whether it is the LEARNER's or the pristine
 * starter. The two always move together — that is why this is one object and not
 * two pieces of state: a `code` that changed without its `hasWork` is exactly
 * the bug a mirror cannot detect (see `./codeSource.ts`).
 *
 * NOT re-exported from `./index.ts`, on purpose. The live-buffer port already
 * carries the same pair as two plain arguments, so a consumer never needs this
 * name — and a type in the public surface is a promise to keep it.
 */
export interface CodeSource {
  code: string;
  hasWork: boolean;
}

export interface UseCodeSnackCallbacks {
  /**
   * Report the settled attempt upward. The `detail` carries the learner's SOURCE
   * as `response` — see `useCodeSnack.complete` for why that is the whole point
   * of this signature and not an afterthought.
   *
   * ⚠️ `onAutosave` USED TO LIVE HERE and is gone. It was a write-side-only
   * override whose own docblock warned that overriding the write without the
   * read hands the learner back the wrong source on the next open — and it had
   * exactly zero call sites: `CodeSnackPane` only ever passed `onComplete`. The
   * `storage` port (`ActivityStoragePort`, read + write + clear together) is
   * what that field was reaching for, so the half-measure left with the move
   * instead of being carried into the package's public surface.
   */
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
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
