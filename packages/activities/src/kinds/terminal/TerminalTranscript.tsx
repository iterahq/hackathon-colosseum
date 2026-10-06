import { useEffect, useRef } from 'react';
import type { TerminalLine } from '@iterahq/activity-spec/runtime';
import { TERMINAL_TRANSCRIPT_SHORT } from './terminalGeometry.js';

/**
 * The transcript — echoed commands and the sandbox's output, oldest first.
 * Purely presentational. Mirrors `SandboxChatLog`'s role for the chat sandbox
 * and lives INSIDE the same `SandboxWindow` chrome, per the 3-zone law of plan
 * `20260717-iterahq-activities-visual-ux-redesign` (whose target image is,
 * literally, the DFL-Labs git sandbox).
 *
 * ── HEIGHT: THIS BOX DOES NOT DECIDE THE HEIGHT — THE WINDOW BODY DOES ──────
 * It is the growing member of the window body's flex column: `grow basis-0`
 * with `min-h-0` so it can shrink below its content, and `overflow-y-auto` so a
 * long session scrolls HERE instead of pushing the prompt bar off the box or
 * the page down. The floor that makes the window terminal-shaped lives on the
 * body (`TERMINAL_BODY` in `TerminalSandboxShell`), which is the only place it
 * can live if the prompt is to stay pinned to the bottom.
 *
 * ⚠️ `grow basis-0`, NOT `flex-1` — they are not interchangeable HERE, and the
 * difference is invisible until you measure. Tailwind's `flex-1` is
 * `flex: 1 1 0%`, and a PERCENTAGE flex-basis resolved against a column whose
 * height is indefinite (this one: `min-height` only) falls back to `content`.
 * The box then sizes to the transcript and grows without bound — measured
 * 2026-08-10: a 12-command session produced a 621px window instead of 314px,
 * with the transcript never scrolling. `basis-0` is `flex-basis: 0px`, which
 * has no such fallback, so the floor is what decides and the overflow lands
 * here.
 *
 * ⚠️ TWO SETTINGS ALREADY FAILED HERE — do not reach for a third by feel:
 *   · `h-[34dvh] min-h-[220px]` (until 2026-08-07) — a fixed pane that could
 *     not scroll independently and grew with the viewport, not with a design.
 *   · `max-h-[34dvh]` with intrinsic height (PR #303, until 2026-08-10) — the
 *     transcript, and with it the whole window, collapsed to one line of canned
 *     output and read as a code block. That is the screenshot Tainan sent on
 *     2026-08-10.
 * `grow basis-0 min-h-0` is neither: this box claims the space the body gives
 * it, no more and no less. Putting a `h-`, `min-h-` or `max-h-` back on it takes
 * the height decision away from the body and breaks the bottom rail.
 *
 * ── THE SUCCESS MARK ────────────────────────────────────────────────────────
 * `successLines` says which line ends a command that COMPLETED A STEP (plan §2;
 * which lines those are is `terminalSuccessMarks`, and why it is `unlocked` and
 * not `ok` is documented there). The line keeps its own colour — the mark is an
 * added element, not a restyling of the output, exactly as §2 asks.
 */
export function TerminalTranscript({
  lines,
  ps1,
  emptyHint,
  successLines,
  successLabel,
}: {
  lines: TerminalLine[];
  ps1: string;
  emptyHint: string;
  /** Indices of lines that end a step-completing command. */
  successLines: ReadonlySet<number>;
  /** Accessible name of the mark — a bare "✓" reads as nothing to a screen reader. */
  successLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={scrollRef}
      className={`min-h-0 grow basis-0 ${TERMINAL_TRANSCRIPT_SHORT} overflow-y-auto pr-1 font-mono text-[13px] leading-relaxed`}
      data-testid="terminal-transcript"
    >
      {lines.length === 0 && <div className="text-muted-foreground">{emptyHint}</div>}
      {lines.map((line, i) => (
        <div
          key={i}
          data-line-kind={line.kind}
          // The handle the layout assertion measures against: "is the prompt
          // glued to the last line". Only the LAST line carries it.
          data-testid={i === lines.length - 1 ? 'transcript-last-line' : undefined}
          className={`whitespace-pre-wrap ${
            line.kind === 'err'
              ? 'text-destructive'
              : line.kind === 'cmd'
                ? 'text-foreground'
                : 'text-muted-foreground'
          }`}
        >
          {line.kind === 'cmd' ? (
            <>
              <span className="font-semibold text-evergreen">{ps1} </span>
              {line.text}
            </>
          ) : (
            line.text
          )}
          {successLines.has(i) && (
            <span
              data-testid="terminal-success-mark"
              aria-label={successLabel}
              title={successLabel}
              className="ml-2 font-semibold text-evergreen"
            >
              ✓
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
