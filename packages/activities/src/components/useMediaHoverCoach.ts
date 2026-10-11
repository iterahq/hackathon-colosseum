/**
 * useMediaHoverCoach — the one-time balloon that says the hover preview exists.
 *
 * Shown to a fine-pointer learner whose switch is still off and who has never
 * seen it, on the first image of the screen only. It is counted as seen once it
 * has stood for `COACH_SEEN_AFTER_MS` or been dismissed, so a reload (or React's
 * dev double-mount) does not use it up before anyone could read it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActivityStorage } from '../context.js';
import {
  claimMediaHoverCoach,
  readMediaHoverCoachSeen,
  releaseMediaHoverCoach,
  writeMediaHoverCoachSeen,
} from '../internal/mediaHoverPreference.js';

export const COACH_SEEN_AFTER_MS = 1500;

export function useMediaHoverCoach(finePointer: boolean, enabled: boolean, inView = true) {
  const storage = useActivityStorage();
  const owner = useRef(Symbol('media-hover-coach'));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!finePointer || enabled || !inView || readMediaHoverCoachSeen(storage)) return;
    const id = owner.current;
    if (!claimMediaHoverCoach(id)) return;
    setVisible(true);
    const seen = setTimeout(() => writeMediaHoverCoachSeen(storage), COACH_SEEN_AFTER_MS);
    return () => {
      clearTimeout(seen);
      releaseMediaHoverCoach(id);
      setVisible(false);
    };
  }, [finePointer, enabled, inView, storage]);

  const dismiss = useCallback(() => {
    writeMediaHoverCoachSeen(storage);
    releaseMediaHoverCoach(owner.current);
    setVisible(false);
  }, [storage]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  return { visible, dismiss };
}
