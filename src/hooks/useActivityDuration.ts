/**
 * DOM half of the per-activity duration measurement (pure half:
 * `src/utils/activityDuration.ts`, which documents what the numbers MEAN).
 *
 * The caller owns the origin — the moment the activity opened for this learner —
 * and hands it in. That is deliberate: the live-class page already had that
 * instant as state (`activityStartedAt`, which also drives the on-screen
 * stopwatch and the podium ranking) and a second clock of our own would drift
 * from the one the learner is watching. One origin, two readers.
 *
 * The hook adds exactly what the caller did NOT have: the hidden-time tally, so
 * a tab left in the background for twenty minutes does not read as twenty
 * minutes of struggle with the activity.
 *
 * Reading is pull-based (`read()`), never state. Duration is sampled once, at
 * the instant the answer settles; re-rendering the player every tick to keep a
 * number nobody displays would be a re-render per second per learner for a value
 * used once.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  applyVisibility,
  sampleDuration,
  startTally,
  type DurationSample,
  type HiddenTally,
} from '@/utils/activityDuration';

/** `document.hidden`, tolerating a non-DOM environment (SSR / node tests). */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * @param startedAt wall-clock origin of the current activity, or null when no
 *                  activity is on screen. Changing it restarts the measurement.
 * @returns `read()` — the sample as of now, or null when there is no origin.
 */
export function useActivityDuration(startedAt: number | null): {
  read: () => DurationSample | null;
} {
  const tallyRef = useRef<HiddenTally>(startTally(startedAt ?? Date.now(), documentHidden()));

  // Restart the tally whenever the window restarts. Keyed on `startedAt` alone:
  // the origin IS the identity of the measurement, so a new activity and a
  // re-armed timer on the same activity are the same event to us.
  useEffect(() => {
    tallyRef.current = startTally(startedAt ?? Date.now(), documentHidden());
  }, [startedAt]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => {
      tallyRef.current = applyVisibility(tallyRef.current, documentHidden(), Date.now());
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const read = useCallback(
    () => sampleDuration(startedAt, tallyRef.current, Date.now()),
    [startedAt]
  );

  return { read };
}
