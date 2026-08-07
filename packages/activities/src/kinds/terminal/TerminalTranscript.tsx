import { useEffect, useRef } from 'react';
import type { TerminalLine } from '@iterahq/activity-spec/runtime';

/**
 * The transcript — echoed commands and the sandbox's output, oldest first.
 * Purely presentational. Mirrors `SandboxChatLog`'s role for the chat sandbox
 * and lives INSIDE the same `SandboxWindow` chrome, per the 3-zone law of plan
 * `20260717-iterahq-activities-visual-ux-redesign` (whose target image is,
 * literally, the DFL-Labs git sandbox).
 *
 * ── HEIGHT: IT GROWS DOWNWARD, IT IS NOT A FIXED PANE ───────────────────────
 * Until 2026-08-07 this box was `h-[34dvh] min-h-[220px]`, i.e. a FIXED pane.
 * On the first frame that reserved ~220px for a transcript holding one welcome
 * line, so the prompt bar underneath was pushed to the bottom of the window and
 * the learner met an empty gap between the context line and the cursor
 * (Tainan's screenshot, plan `20260807-itera-terminal-sandbox-refinamentos` §1).
 *
 * A real terminal grows DOWN from the last line: the cursor starts glued to the
 * context and the history pushes it. So the height is now intrinsic, capped by
 * `max-h-[34dvh]` — the cap is what keeps a long session from eating the page,
 * and it only engages once there IS a long session. Do not reintroduce a
 * `min-h`/`h-` here: that is the gap, restated.
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
      className="max-h-[34dvh] overflow-y-auto pr-1 font-mono text-[13px] leading-relaxed"
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
