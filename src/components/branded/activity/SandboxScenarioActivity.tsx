/**
 * SandboxScenario dispatcher — the `sandbox_scenario` kind splits into three
 * activity types that differ only by how the learner composes the prompt. We
 * pick the concrete component off the scenario's authoring shape:
 *   - `slots`   → SandboxAICompleteWords (fill-in slots)
 *   - `choices` → SandboxAIWithOptions   (pick a context chip)
 *   - neither   → SandboxAI              (open free compose)
 * Kept at the original name/path so `ActivityRenderer` dispatches unchanged.
 */
import type { Scenario } from '@iterahq/activity-spec/runtime';
import type { Activity } from '@/types/content';
import { SandboxAIActivity } from './SandboxAIActivity';
import { SandboxAIWithOptionsActivity } from './SandboxAIWithOptionsActivity';
import { SandboxAICompleteWordsActivity } from './SandboxAICompleteWordsActivity';

export function SandboxScenarioActivity(props: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  const scenario = props.activity.spec as unknown as Scenario;
  if (scenario.slots?.length) return <SandboxAICompleteWordsActivity {...props} />;
  if (scenario.choices?.length) return <SandboxAIWithOptionsActivity {...props} />;
  return <SandboxAIActivity {...props} />;
}
