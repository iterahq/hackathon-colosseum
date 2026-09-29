import { useCallback, useRef, useState } from 'react';

/** Short-lived spark ids: one per keystroke, each gone after 400 ms. */
export function useSparks() {
  const [sparks, setSparks] = useState<number[]>([]);
  const nextId = useRef(0);
  const fire = useCallback(() => {
    const id = ++nextId.current;
    setSparks((current) => [...current.slice(-6), id]);
    window.setTimeout(() => setSparks((current) => current.filter((s) => s !== id)), 400);
  }, []);
  return { sparks, fire };
}
