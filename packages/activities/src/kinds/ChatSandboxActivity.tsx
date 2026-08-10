/**
 * `chat_sandbox` — the `cloud-core-chat` sandbox, split by the authoring SHAPE
 * of the scenario rather than by a second enum value:
 *   · `slots`   → SandboxAICompleteWords (fill-in slots)
 *   · `choices` → SandboxAIWithOptions   (pick a context chip)
 *   · neither   → SandboxAI              (open free compose)
 */
import type { Scenario } from '@iterahq/activity-spec/runtime';
import { SandboxAIActivity } from './sandbox/SandboxAIActivity.js';
import { SandboxAIWithOptionsActivity } from './sandbox/SandboxAIWithOptionsActivity.js';
import { SandboxAICompleteWordsActivity } from './sandbox/SandboxAICompleteWordsActivity.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

export function ChatSandboxActivity(props: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
}) {
  const scenario = props.activity.spec as unknown as Scenario;
  if (scenario.slots?.length) return <SandboxAICompleteWordsActivity {...props} />;
  if (scenario.choices?.length) return <SandboxAIWithOptionsActivity {...props} />;
  return <SandboxAIActivity {...props} />;
}
