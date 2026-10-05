import { useLayoutEffect, useState, type RefObject } from 'react';

/** A curve from the right edge of `from` to the left edge of `to`, in the
 * coordinate space of `container`. Recomputed on hover and on resize. */
export function useConnectorPath(container: RefObject<HTMLElement | null>, from: HTMLElement | null, to: HTMLElement | null) {
  const [path, setPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const box = container.current?.getBoundingClientRect();
      if (!box || !from || !to) return setPath(null);
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.right - box.left + 6;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left - 6;
      const y2 = b.top + b.height / 2 - box.top;
      const bend = Math.max(40, (x2 - x1) / 2);
      setPath(`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [container, from, to]);

  return path;
}
