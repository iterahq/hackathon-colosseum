import { useEffect, useState } from 'react';

const BLINK_EVERY_MS = 3600;
const BLINK_HOLD_MS = 140;

/** True for a beat every few seconds, so the guide blinks while it waits for the learner. */
export function useGuideBlink(enabled: boolean) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let hold: number | undefined;
    const interval = window.setInterval(() => {
      setBlinking(true);
      hold = window.setTimeout(() => setBlinking(false), BLINK_HOLD_MS);
    }, BLINK_EVERY_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(hold);
    };
  }, [enabled]);

  return enabled && blinking;
}
