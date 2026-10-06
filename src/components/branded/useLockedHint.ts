import { useCallback, useEffect, useState } from 'react';

/**
 * Which locked node has its explanation open. One at a time; a tap outside, a
 * second tap on the same node or Escape closes it. Taps on other locked nodes
 * are left to the node's own click so the hint moves instead of flickering.
 */
export function useLockedHint() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const toggle = useCallback((index: number) => setOpenIndex((cur) => (cur === index ? null : index)), []);

  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('[data-testid="tree-node-locked"], [data-testid="tree-lock-hint"]')) return;
      setOpenIndex(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openIndex]);

  return { openIndex, toggle, close };
}
