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
 * Capture is scoped to ONE element that exists on both sides: the Monaco pane in
 * `CodeSnackPane` and its read-only twin in `LiveStage`, both styled from the
 * shared tokens in `utils/codeStageGeometry`. That gives them the same class
 * tokens — NOT the same measured size, since the height is viewport-relative and
 * the two parents differ; the size gap is closed on the wire instead, in
 * `utils/stageCursorPlacement`. The preview pane next to it is a sandboxed
 * cross-origin `<iframe>`: pointer events inside it never reach us, so a cursor
 * normalized against the *pair* of panes would freeze halfway across the screen
 * with no way to tell the class why (plan ADR-8).
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

/**
 * Normalizes a viewport point against a pane, or null when it falls outside it.
 *
 * Lives beside the selectors rather than inside the capture hook because BOTH
 * emitters measure with it — the learner on stage over their own editor and the
 * professor over the mirror — and because it is where the two rounding decisions
 * are made. It is the measuring half of the same contract the attributes above
 * declare, and it is pure, so it is checkable without a pointer.
 */
export function normalizedPointIn(
  el: HTMLElement,
  clientX: number,
  clientY: number
): { x: number; y: number; paneW: number; paneH: number } | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  // Sub-pixel jitter is not movement. Rounding to the transported precision also
  // makes "did it change" the same question on both sides of the wire.
  //
  // The pane size rides along on EVERY frame rather than being measured once: it
  // changes with a window resize and, since the height is viewport-relative
  // (`codeStageGeometry`), a stale value would place the mirrored pointer on the
  // wrong line for the rest of the class. Rounded because a fractional pane size
  // is precision nobody can see, and unrounded it broadcasts the emitter's
  // zoom/DPI to the whole room.
  return {
    x: Math.round(((clientX - r.left) / r.width) * 1000) / 1000,
    y: Math.round(((clientY - r.top) / r.height) * 1000) / 1000,
    paneW: Math.round(r.width),
    paneH: Math.round(r.height),
  };
}
