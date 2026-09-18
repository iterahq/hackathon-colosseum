import { useCallback, useEffect, useState } from 'react';

/**
 * Countdown gate for "resend" actions (signup code, password reset link).
 * `start()` arms a `seconds`-long cooldown; `isActive` is the button's
 * disabled predicate, `remaining` is what to show in the countdown label.
 * `startActive` arms it on mount — the first send already happened on the
 * previous step, and Supabase rejects a second one inside the same window.
 */
export function useResendCooldown(seconds = 60, { startActive = false } = {}) {
  const [remaining, setRemaining] = useState(startActive ? seconds : 0);
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, isActive: running, start };
}
