import { useCallback, useEffect, useRef, useState } from 'react';

/** Open state that closes itself after `ms`, on Escape, or on a pointer press outside `containerRef`. */
export function useTransientOpen<T extends HTMLElement>(ms: number) {
  const containerRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  const toggle = useCallback(() => {
    clearTimeout(timer.current);
    setOpen((cur) => {
      if (!cur) timer.current = setTimeout(() => setOpen(false), ms);
      return !cur;
    });
  }, [ms]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { containerRef, open, toggle, close };
}
