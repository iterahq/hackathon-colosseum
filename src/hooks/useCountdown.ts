import { useEffect, useState } from 'react';

/**
 * Ticks the remaining whole seconds until an absolute epoch-ms `deadline`.
 * Returns 0 when there is no deadline or it has passed. Clients derive the
 * countdown from the shared deadline (not a local duration) so every screen
 * agrees regardless of when the timer broadcast arrived.
 */
export function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  return remaining;
}
