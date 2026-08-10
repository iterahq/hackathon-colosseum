import { useEffect } from 'react';
import { useActivityLiveBuffer } from '../../context.js';
import type { ActivityChatScreen } from '../../ports.js';

/**
 * Keep the host's live buffer pointed at the chat that is on screen.
 *
 * Sibling of `useCodeLiveBuffer` and `useTerminalScreenMirror`, and it exists
 * for the same measured reason one kind further along. The code kind's mirror
 * was fixed on 2026-08-06 and the terminal's on 2026-08-10; the chat was left
 * reading nothing, so when the Itera Player's instructor pulled a learner
 * working a `chat_sandbox` to the class stage, the stage fell back to MOUNTING
 * THE ACTIVITY — which seeds a fresh `initialModel` from the VIEWER's own
 * client. The room therefore saw the authored opener under the learner's name,
 * with none of the conversation they had actually had.
 *
 * ⚠️ A MOUNTED RENDERER IS NOT A MIRROR. That is the whole lesson of this hook,
 * and the chat is the case where it was hardest to see: an empty chat window
 * with a greeting in it looks like a working chat sandbox.
 *
 * PUBLISHING IS NOT PERSISTING here either: nothing in this path survives a
 * reload, so a pristine chat can be projected without also being restored.
 *
 * ── WHAT THIS HOOK REFUSES TO PUBLISH ───────────────────────────────────────
 * The caller builds the screen from `model.messages` — the turns the learner
 * SENT. The composer (`useSandboxScenario().inputText`) is not part of it and
 * must never be: mirroring an unsent draft projects a learner mid-thought
 * rather than a learner's answer. `ActivityChatScreen` states the rule at the
 * type; this is the second place it has to hold.
 *
 * `hasWork` is `ranPromptCount > 0`, not `messages.length > 0`: every scenario
 * opens with authored `seedMessages`, so a transcript is never empty and
 * counting it would announce every idle learner as "em andamento".
 *
 * A host that injected no port, or one whose port predates `publishChat`, gets a
 * no-op. Cleanup shares `forget` with the other buffers: leaving the entry
 * behind would keep projecting a conversation the learner already left.
 */
export function useChatScreenMirror(
  activityId: string,
  screen: ActivityChatScreen,
  hasWork: boolean,
): void {
  const liveBuffer = useActivityLiveBuffer();
  useEffect(() => {
    liveBuffer.publishChat?.(activityId, screen, hasWork);
    return () => liveBuffer.forget(activityId);
  }, [liveBuffer, activityId, screen, hasWork]);
}
