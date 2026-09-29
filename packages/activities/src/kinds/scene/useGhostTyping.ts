import { useEffect, useState } from 'react';

/**
 * Types `target` one character at a time (70–160 ms, jittered so it reads as a
 * hand), then reports done. `enabled: false` starts it already finished.
 */
export function useGhostTyping(target: string, enabled: boolean, onKey: () => void) {
  const [typed, setTyped] = useState(enabled ? '' : target);
  const done = typed.length >= target.length;

  useEffect(() => {
    if (!enabled || done) return;
    const delay = typed.length === 0 ? 900 : 70 + Math.random() * 90;
    const timer = window.setTimeout(() => {
      setTyped(target.slice(0, typed.length + 1));
      onKey();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, done, typed, target, onKey]);

  return { typed, done };
}
