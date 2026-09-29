import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityCompleteHandler, PortableActivity } from '../../renderer.js';
import { useActivityActionRecorder, type ReadingAction } from '../../internal/actionRecorder.js';
import { useActivityI18n } from '../../context.js';

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

  useEffect(() => {
    firedRef.current = activity.status === 'done';
    setSolved(activity.status === 'done');
  }, [activity.id, activity.status]);

  const open = useCallback(
    (payload?: Record<string, unknown>) => {
      if (firedRef.current) return;
      firedRef.current = true;
      setSolved(true);
      recorder.record('gate_opened', payload);
      // `message` is what a host footer shows: a discovery, never "correct".
      onComplete(true, { actions: recorder.drain(), message: t('activity.scene.solved') });
    },
    [onComplete, recorder, t],
  );

  return { solved, open, record: recorder.record };
}
