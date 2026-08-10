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
 */
export const CHAT_SCROLL = 'h-[34dvh] min-h-[220px] max-h-[400px] overflow-y-auto pr-1';
