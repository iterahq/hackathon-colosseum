/**
 * Where to draw the mirrored pointer inside the read-only pane — in PIXELS of the
 * EMITTER's pane, not in percent of the mirror's.
 *
 * Percent would only be right if both panes measured the same, and they do not:
 * the emitter is a pane inside a padded card on a learner's laptop, the mirror
 * fills the palco on a projector. Monaco's font is a fixed px size on both sides
 * and does NOT scale with the pane, so the same FRACTION is a different LINE —
 * measured on the 06/08 layout, `y=0.5` was line 10 for the learner and line 14
 * on the projector, the exact "lands a few lines off" failure the cursor contract
 * (`stageCursorDom`) warns about. Multiplying by the emitter's own pane size
 * (carried on the frame) lands on the same character instead.
 *
 * A pointer that falls outside the mirror's box is clipped by the pane's
 * `overflow-hidden`, and that is the honest outcome: that part of the learner's
 * pane genuinely is not on screen here, so there is no right place to draw it.
 */

/**
 * Ceiling for a pane size accepted off the wire. The sender is forgeable (the
 * cursor topic authorizes by session participation, not by role), and an absurd
 * size just draws the pointer outside the clipped box — so this is about keeping
 * the value interpretable, not about preventing damage. Generous on purpose: an
 * 8K display is ~7680px wide.
 */
export const MAX_PANE_PX = 8192;

/**
 * `paneW`/`paneH` absent = a frame from a client that predates px placement.
 * Falling back to percent keeps an old emitter drawing (a little off) instead of
 * not at all.
 */
export function stageCursorPlacement(
  fx: number,
  fy: number,
  paneW?: number,
  paneH?: number
): { left: string; top: string } {
  return {
    left: paneW ? `${fx * paneW}px` : `${fx * 100}%`,
    top: paneH ? `${fy * paneH}px` : `${fy * 100}%`,
  };
}
