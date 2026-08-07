import { useEffect, useRef, useState } from 'react';
import type { Message } from '@iterahq/activity-spec/runtime';

const DOTS_MS = 500;
const TICK_MS = 28;
const TARGET_TICKS = 55;

type Phase = 'idle' | 'dots' | 'typing';

/**
 * Presentation-only pacing: makes the newest assistant reply feel like it is
 * being typed live (typing dots → typewriter reveal) instead of popping in as a
 * finished block. The runtime stays deterministic — this only meters how the
 * already-computed text surfaces. When real token streaming (OpenRouter) lands
 * it can drive `revealed` directly with the same view.
 *
 * Seed messages present at mount never animate; only a message appended after
 * mount whose role is `assistant` streams.
 */
export function useAssistantStream(messages: Message[]) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [revealed, setRevealed] = useState(0);
  const streamIndex = useRef(-1);
  const seen = useRef(messages.length);

  useEffect(() => {
    if (messages.length > seen.current) {
      if (messages[messages.length - 1]?.role === 'assistant') {
        streamIndex.current = messages.length - 1;
        setRevealed(0);
        setPhase('dots');
      }
    } else if (messages.length < seen.current) {
      streamIndex.current = -1;
      setPhase('idle');
    }
    seen.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (phase !== 'dots') return;
    const id = setTimeout(() => setPhase('typing'), DOTS_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'typing') return;
    const full = messages[streamIndex.current]?.text ?? '';
    if (revealed >= full.length) {
      setPhase('idle');
      return;
    }
    const step = Math.max(2, Math.ceil(full.length / TARGET_TICKS));
    const id = setTimeout(() => setRevealed((r) => Math.min(full.length, r + step)), TICK_MS);
    return () => clearTimeout(id);
  }, [phase, revealed, messages]);

  const active = phase !== 'idle';
  return {
    active,
    streamIndex: active ? streamIndex.current : -1,
    dots: phase === 'dots',
    revealed,
  };
}
