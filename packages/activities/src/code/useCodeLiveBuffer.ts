import { useEffect } from 'react';
import { useActivityLiveBuffer } from '../context.js';
import type { ActivityLiveBufferPort } from '../ports.js';

/**
 * Keep the host's live buffer pointed at what is on screen, from the FIRST
 * paint — not from the first keystroke.
 *
 * A mirror used to read the draft store instead, whose write is debounced AND
 * held back until the learner types (deliberately: a draft asserts "there is
 * work here"). Measured in the Itera Player's live class on 2026-08-06: a
 * learner who opened a code exercise and typed nothing answered the instructor's
 * pull with a placeholder, and the room saw an empty screen. Publishing from
 * mount fixes that without making the draft eager — see `ActivityLiveBufferPort`
 * for why the two channels stay separate.
 *
 * The cleanup is half the value. Leaving the entry behind would keep a mirror
 * projecting the last source of an activity the learner has already left, and
 * the viewer would have no way to tell it is stale.
 *
 * A host that injected no port gets no-ops, so this costs a consumer with no
 * live class one effect that calls two empty functions.
 *
 * Returns the port for the ONE caller that must publish out of band: see how
 * `useCodeSnack.resetToStarter` orders its publish against the draft clear.
 */
export function useCodeLiveBuffer(
  activityId: string,
  code: string,
  hasWork: boolean,
): ActivityLiveBufferPort {
  const liveBuffer = useActivityLiveBuffer();
  useEffect(() => {
    liveBuffer.publish(activityId, code, hasWork);
    return () => liveBuffer.forget(activityId);
  }, [liveBuffer, activityId, code, hasWork]);
  return liveBuffer;
}
