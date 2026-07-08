import { useEffect, useState } from 'react';

/**
 * Counts whole seconds UP from an epoch-ms `startedAt` (0 when none). The
 * mirror of useCountdown — used to time how long a learner takes on an activity.
 */
export function useStopwatch(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
