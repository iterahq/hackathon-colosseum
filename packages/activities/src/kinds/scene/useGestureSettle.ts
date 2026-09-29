import { useEffect, useRef } from 'react';

const DEFAULT_SETTLE_MS = 700;

/**
 * Shared "the gesture cannot fail, it just has to hold" gate for the
 * scene-mechanics batch (`dial`, `selector`, `arrange` — every kind whose B3
 * is "settles in the right state", not a submit).
 *
 * Fires `onSettle` once `condition` has been continuously true for `delayMs`.
 * Clears the timer the instant `condition` goes false again, so a learner who
 * passes through the right value on the way to a wrong one is not gated on a
 * value they moved away from — the same debounce shape `useLiveTypeTurn` uses
 * for its own settle window.
 */
export function useGestureSettle(condition: boolean, onSettle: () => void, delayMs = DEFAULT_SETTLE_MS) {
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  useEffect(() => {
    if (!condition) return;
    const timer = window.setTimeout(() => onSettleRef.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [condition, delayMs]);
}
