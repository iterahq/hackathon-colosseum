import { useEffect, useState } from "react";

/** Types `target` one character at a time, then reports done. */
export function useGhostTyping(target: string, enabled: boolean, onKey: () => void) {
  const [typed, setTyped] = useState("");
  const done = typed.length === target.length;

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
