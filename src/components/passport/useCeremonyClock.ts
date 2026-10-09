import { useEffect, useState } from 'react';

/** Milestones of the ceremony in ms: page, Tera, stamp drop, counter, gold, status row. */
export const STEPS_MS = [0, 300, 600, 900, 1300, 1600] as const;
export const LAST_STEP = STEPS_MS.length;

/** Step 0..6 of the ceremony; jumps to the final frame when motion is reduced. */
export function useCeremonyClock(reduce: boolean, restartKey: unknown): number {
  const [step, setStep] = useState(reduce ? LAST_STEP : 0);
  useEffect(() => {
    if (reduce) {
      setStep(LAST_STEP);
      return;
    }
    setStep(0);
    const timers = STEPS_MS.map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduce, restartKey]);
  return step;
}
