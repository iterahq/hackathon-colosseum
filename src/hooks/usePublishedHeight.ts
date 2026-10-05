import { useEffect, type RefObject } from 'react';

/**
 * Publishes the height of a bar fixed to the bottom as a CSS variable on
 * `<html>` while it is up, so the page reserves exactly that much room under
 * its content instead of a guessed constant. The scene hint bar of
 * `@iterahq/activities` publishes `--scene-hint-h` the same way; the hook is
 * not on the public surface of the package, hence this copy.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement | null>, variable: string, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(variable, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable, active]);
}
