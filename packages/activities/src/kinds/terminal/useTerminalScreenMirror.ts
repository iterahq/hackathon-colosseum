import { useEffect } from 'react';
import { useActivityLiveBuffer } from '../../context.js';
import type { ActivityTerminalScreen } from '../../ports.js';

/**
 * Keep the host's live buffer pointed at the terminal that is on screen.
 *
 * Sibling of `useCodeLiveBuffer`, and it exists for the same measured reason
 * one step further along. The code kind's mirror was fixed on 2026-08-06; the
 * terminal was left reading nothing, so when the Itera Player's instructor
 * pulled a learner working a `terminal_sandbox` to the class stage, the stage
 * fell back to MOUNTING THE ACTIVITY — which seeds a fresh
 * `initialTerminalModel` from the VIEWER's own client. The room therefore saw an
 * empty prompt under the learner's name: neither what they typed nor what the
 * sandbox answered (Tainan, TG 2026-08-10).
 *
 * ⚠️ A MOUNTED RENDERER IS NOT A MIRROR. That is the whole lesson of this hook.
 * `code` was excluded from the stage's activity-mirror because its renderer
 * would seed from the viewer's storage; the terminal had the same hazard with no
 * such guard, and it was invisible because the result LOOKS like a working
 * terminal — just an empty one, which reads as "the learner did nothing".
 *
 * PUBLISHING IS NOT PERSISTING here either: nothing in this path survives a
 * reload, so a pristine terminal can be projected without also being restored.
 * `hasWork` is `commandCount > 0` — a terminal whose only content is the
 * authored welcome banner is on screen but is not work.
 *
 * A host that injected no port, or one whose port predates `publishTerminal`,
 * gets a no-op. Cleanup shares `forget` with the code buffer: leaving the entry
 * behind would keep projecting a screen the learner already left.
 */
export function useTerminalScreenMirror(
  activityId: string,
  screen: ActivityTerminalScreen,
  hasWork: boolean,
): void {
  const liveBuffer = useActivityLiveBuffer();
  useEffect(() => {
    liveBuffer.publishTerminal?.(activityId, screen, hasWork);
    return () => liveBuffer.forget(activityId);
  }, [liveBuffer, activityId, screen, hasWork]);
}
