import { useLayoutEffect, type RefObject } from 'react';

/** A host that wants its code panes to give height back marks an ancestor with this. */
export const FIT_VIEWPORT_ATTRIBUTE = 'data-fit-viewport';

/** Eight lines on a phone, where one pane shows at a time; twelve beside each other. */
const PHONE_FLOOR_PX = 176;
const FLOOR_PX = 264;
const PHONE_MAX_WIDTH_PX = 640;

/**
 * Shrinks the code panes by exactly what the page overflows, down to a floor,
 * so the instruction, the editor and the submit button share one
 * screen. The pane boxes keep their shared geometry classes; this only ever
 * writes an inline height that is SMALLER than what those classes give.
 *
 * Opt-in by an ancestor carrying `data-fit-viewport` (the self-paced lesson). A
 * host without it — the live stage, a story — is left exactly as the classes
 * draw it.
 */
export function useShrinkToFit(panes: RefObject<HTMLElement | null>[]) {
  useLayoutEffect(() => {
    const elements = panes.map((pane) => pane.current).filter((el): el is HTMLElement => el !== null);
    const host = elements[0]?.closest<HTMLElement>(`[${FIT_VIEWPORT_ATTRIBUTE}]`);
    if (!host) return;

    const fit = () => {
      for (const el of elements) el.style.height = '';
      const natural = elements[0].getBoundingClientRect().height;
      const overflow = document.documentElement.scrollHeight - window.innerHeight;
      if (overflow <= 0) return;
      const floor = window.innerWidth < PHONE_MAX_WIDTH_PX ? PHONE_FLOOR_PX : FLOOR_PX;
      const height = Math.max(floor, Math.floor(natural - overflow));
      if (height >= natural) return;
      for (const el of elements) el.style.height = `${height}px`;
    };

    fit();
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(host);
    return () => {
      window.removeEventListener('resize', fit);
      observer?.disconnect();
      for (const el of elements) el.style.height = '';
    };
    // The refs are stable; the panes mount once with the activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
