import { useLayoutEffect, useState, type RefObject } from 'react';
import { FIT_VIEWPORT_ATTRIBUTE } from './useShrinkToFit.js';

const MIN_WIDTH_PX = 1024;
const TALL_SHARE = 0.2;

/**
 * True when the instruction should sit BESIDE the code panes instead of above them.
 *
 * A long instruction above the panes left them whatever height the screen had
 * over: an eight-item exam turned the editor and its result into two 176 px
 * slits. On a wide screen the instruction takes a column of its own and the
 * panes keep their full height.
 *
 * The rule cannot flip back and forth: beside the panes the instruction is
 * narrower, so it only gets taller than the measure that sent it there.
 *
 * Opt-in by the same ancestor as `useShrinkToFit`; the live stage keeps the
 * stacked shape its cursor mirror was measured on.
 */
export function useSideInstruction(instruction: RefObject<HTMLElement | null>): boolean {
  const [side, setSide] = useState(false);

  useLayoutEffect(() => {
    const el = instruction.current;
    const host = el?.closest<HTMLElement>(`[${FIT_VIEWPORT_ATTRIBUTE}]`);
    if (!el || !host) return;

    const decide = () =>
      setSide(
        window.innerWidth >= MIN_WIDTH_PX &&
          el.getBoundingClientRect().height > window.innerHeight * TALL_SHARE,
      );

    decide();
    window.addEventListener('resize', decide);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(decide);
    observer?.observe(el);
    return () => {
      window.removeEventListener('resize', decide);
      observer?.disconnect();
    };
    // The ref is stable; the instruction mounts once with the activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return side;
}
