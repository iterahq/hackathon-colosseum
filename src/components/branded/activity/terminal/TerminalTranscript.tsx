import { useEffect, useRef } from 'react';
import type { TerminalLine } from '@iterahq/activity-spec/runtime';

/**
 * The transcript — echoed commands and the sandbox's output, oldest first.
 * Purely presentational. Mirrors `SandboxChatLog`'s role for the chat sandbox
 * and lives INSIDE the same `SandboxWindow` chrome, per the 3-zone law of plan
 * `20260717-iterahq-activities-visual-ux-redesign` (whose target image is,
 * literally, the DFL-Labs git sandbox).
 */
export function TerminalTranscript({
  lines,
  ps1,
  emptyHint,
}: {
  lines: TerminalLine[];
  ps1: string;
  emptyHint: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={scrollRef}
      className="h-[34dvh] min-h-[220px] max-h-[400px] overflow-y-auto pr-1 font-mono text-[13px] leading-relaxed"
      data-testid="terminal-transcript"
    >
      {lines.length === 0 && <div className="text-muted-foreground">{emptyHint}</div>}
      {lines.map((line, i) => (
        <div
          key={i}
          data-line-kind={line.kind}
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
        </div>
      ))}
    </div>
  );
}
