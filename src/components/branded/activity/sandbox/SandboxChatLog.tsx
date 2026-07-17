import { useEffect, useRef } from 'react';
import type { Message } from '@iterahq/activity-spec/runtime';
import { SandboxBubble } from './SandboxBubble';

/**
 * The chat transcript — STRICTLY the message exchange, nothing else. Steps,
 * instructions, choices and ratings live outside the chat (below/beside it) so
 * the chat reads like a real conversation for someone who has never used one.
 * The message at `streamIndex` is paced by `useAssistantStream`
 * (dots → typewriter) so the newest reply reads as typed live. Auto-scrolls.
 */
export function SandboxChatLog({
  messages,
  streamIndex,
  dots,
  revealed,
}: {
  messages: Message[];
  streamIndex: number;
  dots: boolean;
  revealed: number;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, revealed]);

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
      <div ref={endRef} />
    </div>
  );
}
