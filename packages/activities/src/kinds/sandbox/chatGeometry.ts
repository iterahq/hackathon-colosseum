/**
 * The scroll box the chat transcript lives in, inside the `SandboxWindow`.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 * Same reason as `terminalGeometry.ts`, one kind over. `ChatScreenMirror`
 * redraws a learner's conversation on someone else's screen. If it picked its
 * own box, the learner's window and the viewer's window would be two different
 * shapes for the same chat, and the drift would show up at exactly the moment
 * the two are meant to be compared — the instructor asking the room to look at
 * what this person wrote.
 *
 * One constant, two callers: `SandboxScenarioShell` (the learner) and
 * `ChatScreenMirror` (the room). The value is verbatim what the shell had
 * inline before it moved here, so nothing renders differently.
 *
 * `h-[34dvh]` with a floor and a ceiling, rather than intrinsic height: a chat
 * that grows unbounded would push the composer off the window on a long
 * transcript, and one that collapses to its content reads as a quote block
 * instead of a chat.
 *
 * On a phone the 34dvh box leaves the composer 3 px under the fold at 844 px of
 * height, so it takes 30dvh there. At 700 px of height or less the 220 px floor
 * is what pushes the composer and the chips under the fold, with one bubble in
 * it: there the box takes its content's height, up to 28dvh, and scrolls past
 * that. The two media rules do not overlap, so their order in the sheet cannot
 * matter.
 */
export const CHAT_SCROLL =
  'h-[34dvh] min-h-[220px] max-h-[400px] overflow-y-auto pr-1 [@media(min-height:701px)_and_(max-width:639px)]:h-[30dvh] [@media(max-height:700px)_and_(max-width:639px)]:h-auto [@media(max-height:700px)_and_(max-width:639px)]:min-h-[72px] [@media(max-height:700px)_and_(max-width:639px)]:max-h-[28dvh]';
export const CHAT_SCROLL_END = '[@media(max-height:700px)_and_(max-width:639px)]:-mt-3.5';
