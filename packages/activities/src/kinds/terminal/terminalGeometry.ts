/**
 * ── THE WINDOW IS A TERMINAL-SIZED BOX, AND THE PROMPT IS ITS BOTTOM RAIL ────
 * Tainan, TG 2026-08-10, on the `terminal_sandbox` activity in the author
 * harness: *"o terminal component deve ter um min-height (…350px?), de forma
 * que mesmo qndo tem pouco conteudo fica parecendo um terminal mesmo. veja que
 * o bloco de input continua alinhado ao bottom"*.
 *
 * ⚠️ THIS SUPERSEDES PR #303, WHICH DID THE OPPOSITE — read this before you
 * "restore" anything. #303 made the transcript intrinsically sized so the
 * prompt would sit glued to the last line, and the whole window collapsed with
 * it: one canned output line produced a ~152px box that reads as a CODE BLOCK,
 * not as a terminal. The screenshot that motivated #303 and the screenshot that
 * motivated this change are the same window at two extremes, and the answer to
 * both is the same: the BOX gets a floor, the CONTENT does not. #303 put the
 * reserved space inside the transcript (`h-[34dvh] min-h-[220px]`), where it
 * could grow without bound and could not scroll independently; here it lives on
 * the body, and the transcript is the thing that scrolls.
 *
 * WHY `min-h` AND NOT `h`: the transcript is `grow basis-0`, so it never
 * contributes to the box's intrinsic height and the floor is what you get —
 * `min-h` behaves as a height in every normal case. It stays `min-h` so the box
 * GROWS instead of clipping in the one case that can exceed it: a prompt bar
 * that wraps (long `ps1`, many token chips) on a very narrow screen. Clipping
 * the composer is the one failure the learner cannot work around.
 *
 * THE NUMBER: 314px of body + the 36px title bar = a 350px window, which is the
 * size Tainan pointed at. `min(…, 40dvh)` is the small-screen degrade — a hard
 * 350px is over half of a 667px phone viewport, with the instruction above it
 * and the option palette below. At 40dvh that phone gets a 267px body (a 303px
 * window) and a landscape phone gets proportionally less. On any viewport
 * taller than ~785px the 314px floor is what binds.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 * `TerminalScreenMirror` redraws a learner's terminal on someone else's screen.
 * If it picked its own floor, a viewer's window and the learner's window would
 * be two different shapes for the same terminal, and the drift would appear at
 * the exact moment the two are meant to be compared. One constant, two callers.
 *
 * ── SHORT PHONES ─────────────────────────────────────────────────────────────
 * At 700px of height or less (360x640) the floor is 256px of mostly empty
 * transcript above two lines of text, and the options sit under the fold. There
 * the floor drops to 112px (never a collapsed window) and
 * `TERMINAL_TRANSCRIPT_SHORT` lets the transcript take its content's height, up
 * to 26dvh, before it scrolls.
 */
export const TERMINAL_BODY =
  'flex flex-col min-h-[min(314px,40dvh)] [@media(max-height:700px)_and_(max-width:639px)]:min-h-[112px]';
export const TERMINAL_TRANSCRIPT_SHORT = '[@media(max-height:700px)_and_(max-width:639px)]:grow-0 [@media(max-height:700px)_and_(max-width:639px)]:basis-auto [@media(max-height:700px)_and_(max-width:639px)]:max-h-[26dvh]';
