import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityCompleteHandler, PortableActivity } from '../../renderer.js';
import { useActivityActionRecorder, type ReadingAction } from '../../internal/actionRecorder.js';
import { useActivityI18n, useActivitySound } from '../../context.js';
import type { ActivitySoundCue } from '../../ports.js';

// A step cue that lands in the same tick as the completing one is dropped:
// one cue per learner action.
const SAME_ACTION_MS = 50;

/**
 * The gate every scene kind shares: nothing completes before the gesture, and
 * the gesture completes the activity exactly once. Ungraded — `true` is "done",
 * like `concept`. An activity already `done` opens solved and never re-fires.
 */
export function useSceneGate(activity: PortableActivity, onComplete: ActivityCompleteHandler) {
  const alreadyDone = activity.status === 'done';
  const [solved, setSolved] = useState(alreadyDone);
  const firedRef = useRef(alreadyDone);
  const recorder = useActivityActionRecorder<ReadingAction>(activity.id);
  const { t } = useActivityI18n();
  const cue = useActivitySound();
  const completedAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    firedRef.current = activity.status === 'done';
    setSolved(activity.status === 'done');
  }, [activity.id, activity.status]);

  const open = useCallback(
    (payload?: Record<string, unknown>) => {
      if (firedRef.current) return;
      firedRef.current = true;
      setSolved(true);
      completedAtRef.current = Date.now();
      cue('complete');
      recorder.record('gate_opened', payload);
      // `message` is what a host footer shows: a discovery, never "correct".
      onComplete(true, { actions: recorder.drain(), message: t('activity.scene.solved') });
    },
    [onComplete, recorder, t, cue],
  );

  /** The cue of one step of the gesture; call it AFTER `open` so the completion wins. */
  const step = useCallback(
    (name: ActivitySoundCue) => {
      if (Date.now() - completedAtRef.current < SAME_ACTION_MS) return;
      cue(name);
    },
    [cue],
  );

  return { solved, open, record: recorder.record, step };
}
