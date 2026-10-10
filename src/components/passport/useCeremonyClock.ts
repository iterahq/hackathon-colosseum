import { useEffect, useRef, useState } from 'react';

/** Milestones of the ceremony in ms: page, Tera, stamp drop, counter, gold, status row. */
export const STEPS_MS = [0, 300, 600, 900, 1300, 1600] as const;
export const LAST_STEP = STEPS_MS.length;
/** Where the ceremony waits while the server has not answered: the page and Tera are in, nothing is stamped. */
export const HOLD_STEP = 2;

/**
 * Step 0..6 of the ceremony; jumps to the final frame when motion is reduced.
 * While `hold` is true it stops at `HOLD_STEP`; once released the stamp drops at once and the rest keeps its rhythm.
 */
export function useCeremonyClock(reduce: boolean, restartKey: unknown, hold = false): number {
  const [step, setStep] = useState(reduce ? (hold ? HOLD_STEP : LAST_STEP) : 0);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
    if (reduce) return;
    setStep(0);
    const timers = STEPS_MS.slice(0, HOLD_STEP).map((ms, i) => window.setTimeout(() => setStep((s) => Math.max(s, i + 1)), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduce, restartKey]);

  useEffect(() => {
    if (reduce) {
      setStep(hold ? HOLD_STEP : LAST_STEP);
      return;
    }
    if (hold) return;
    const wait = Math.max(0, STEPS_MS[HOLD_STEP] - (Date.now() - startedAt.current));
    const timers = STEPS_MS.slice(HOLD_STEP).map((ms, i) => window.setTimeout(() => setStep(HOLD_STEP + i + 1), wait + ms - STEPS_MS[HOLD_STEP]));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduce, restartKey, hold]);

  return step;
}
