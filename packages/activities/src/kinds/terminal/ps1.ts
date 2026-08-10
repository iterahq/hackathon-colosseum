/**
 * ── THE PROMPT PREFIX IS AUTHORED CONTENT; ITS *WIDTH* IS OURS TO DECIDE ────
 *
 * Tainan, TG 2026-08-10, with a phone screenshot of the composer: *"no mobile
 * não aparece o input completo, talvez no mobile mostrar só $ para aparecer o
 * restante do input"*. In that screenshot the typed text was clipped to TWO
 * characters — `aluno@itera:~/meu-site$` is 23 monospace glyphs (~180px at
 * 13px) and the send button is another 44px, so on a 375px phone there was
 * nothing left for the line the learner was composing.
 *
 * This module derives the SHORT form of that prefix. It is a display decision
 * and nothing else:
 *
 *   · `initialState.ps1` is never rewritten. The stored spec is untouched.
 *   · The TRANSCRIPT still echoes the full prefix on every command that runs
 *     (`TerminalTranscript`, `line.kind === 'cmd'`), where it wraps instead of
 *     clipping. So `user@host:dir` is still taught — it is only the composer,
 *     the one place where every pixel is competing with the learner's own
 *     text, that gives it up.
 *   · Nothing about the recorded turn changes: what runs is `s.line`, and the
 *     trace never carried the prefix in the first place.
 *
 * ── WHY THE SIGIL AND NOT THE TRAILING PATH ─────────────────────────────────
 * `~/meu-site$` reads better and would have fit THIS scenario. It is not a fix,
 * because its width is authored: `ps1` is `z.string()` in
 * `@iterahq/activity-spec`, so the trailing segment is unbounded and the next
 * author who writes `~/projetos/site-do-cliente$` reproduces the bug exactly.
 * A sigil is one character by construction — the only short form that is a
 * GUARANTEE rather than a bet on the current fixture. Tainan asked for `$`.
 *
 * The sigil is READ OFF the authored prompt rather than hard-coded, so the one
 * bit of meaning that does fit survives: `#` still says root, `%` still says
 * zsh. Anything else (no sigil, a prompt ending in a path) falls back to `$`,
 * which is what he asked for.
 */

/** Prompt sigils, in the conventional reading: user · root · zsh · generic. */
const SIGILS = ['$', '#', '%', '>'] as const;

const FALLBACK = '$';

/**
 * The one-glyph stand-in for `ps1`, for widths where the full prefix would eat
 * the input. Pure — it reads a string and returns a string.
 */
export function promptSigil(ps1: string): string {
  const trimmed = ps1.trimEnd();
  const last = trimmed.slice(-1);
  return (SIGILS as readonly string[]).includes(last) ? last : FALLBACK;
}
