import { useEffect, useRef } from 'react';
import type { Message } from '@iterahq/activity-spec/runtime';
import { SandboxBubble } from './SandboxBubble';

/**
 * The chat transcript — a clean message column (no boxed frame), like a real AI
 * chat. The message at `streamIndex` is paced by `useAssistantStream`
 * (dots → typewriter) so the newest reply reads as typed live. An optional inline
 * `coach` line closes the column with the current step's instruction, the way a
 * chat surfaces "what to do next" rather than a separate panel. Auto-scrolls.
 */
export function SandboxChatLog({
  messages,
  streamIndex,
  dots,
  revealed,
  done,
  stepLabel,
  coachPrompt,
  coachHint,
}: {
  messages: Message[];
  streamIndex: number;
  dots: boolean;
  revealed: number;
  done: boolean;
  stepLabel?: string;
  coachPrompt?: string;
  coachHint?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, revealed, done, coachPrompt]);

  return (
    <div className="flex flex-col gap-3.5" data-testid="sandbox-chat">
      {messages.map((m, i) => {
        const streaming = i === streamIndex;
        return (
          <SandboxBubble
            key={i}
            role={m.role}
            text={streaming && dots ? '' : streaming ? m.text.slice(0, revealed) : m.text}
            streaming={streaming && !dots}
            dots={streaming && dots}
          />
        );
      })}

      {coachPrompt && !done && (
        <div className="animate-fade-in flex flex-col gap-1 pt-1" data-testid="sandbox-instruction">
          {stepLabel && (
            <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{stepLabel}</div>
          )}
          <p className="text-[15px] font-medium leading-relaxed text-foreground">{coachPrompt}</p>
          {coachHint && <p className="text-[13px] leading-relaxed text-muted-foreground">{coachHint}</p>}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
