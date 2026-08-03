/**
 * The DOM contract between the cursor's EMITTER and its MIRROR.
 *
 * Deliberately attribute-based instead of prop-based. The emitting surface is
 * the learner's own code pane, which lives deep inside the activity tree —
 * and that tree has a public-contract boundary (`activityPublicContract.test.ts`):
 * what an activity needs from the host arrives through injected ports, not
 * through new props threaded down from a live-class hook. A `data-*` marker
 * lets the live layer find the pane without the activity growing a prop or an
 * import it has no business having. It is the same shape as the existing
 * `CODE_SNAPSHOT_EVENT` window bridge the live stage already uses for autosave.
 *
 * ## Why the EDITOR PANE and not the whole activity
 *
 * Normalized coordinates are only honest between containers of the same shape
 * (plan ADR-4). The one element that is byte-for-byte identical on both sides —
 * `h-[360px] overflow-hidden rounded-2xl` — is the Monaco pane in
 * `CodeSnackPane` and its read-only twin in `LiveStage`. The preview pane next
 * to it is a sandboxed cross-origin `<iframe>`: pointer events inside it never
 * reach us, so a cursor normalized against the *pair* of panes would freeze
 * halfway across the screen with no way to tell the class why (plan ADR-8).
 *
 * Scoping capture to the editor pane makes that boundary explicit and gives the
 * privacy rule for free: a pointer outside the pane is not transmitted at all.
 */

/** Marks the pane whose pointer/caret is broadcast (the learner's own editor). */
export const STAGE_CURSOR_SOURCE_ATTR = 'data-stage-cursor-source';
export const STAGE_CURSOR_SOURCE_SELECTOR = `[${STAGE_CURSOR_SOURCE_ATTR}]`;

/** Marks the pane the remote cursor is drawn into (the read-only mirror). */
export const STAGE_CURSOR_MIRROR_ATTR = 'data-stage-cursor-mirror';
export const STAGE_CURSOR_MIRROR_SELECTOR = `[${STAGE_CURSOR_MIRROR_ATTR}]`;

/**
 * Window event carrying the local Monaco caret (1-based line/column).
 *
 * Fired by `CodeEditor` only when it is EDITABLE, so the read-only mirror can
 * never echo a caret back and create a loop. The caret rides the throttled
 * cursor frame rather than a channel of its own — it costs zero extra messages.
 */
export const CODE_CARET_EVENT = 'itera:code-caret';

export interface CodeCaretEventDetail {
  line: number;
  column: number;
}
