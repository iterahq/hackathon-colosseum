/**
 * SandboxAICompleteWords — the learner assembles the prompt by filling slots
 * (`scenario.slots`: select chips or free text), sends, then rates the answer.
 * Its authoring shape is a base prompt with typed slots to complete. Delegates
 * the chat/reveal scaffold to `SandboxScenarioShell`.
 */
import { SandboxScenarioShell } from './SandboxScenarioShell.js';
import type { PortableActivity } from '../../renderer.js';

export function SandboxAICompleteWordsActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  return <SandboxScenarioShell activity={activity} onComplete={onComplete} reveal={reveal} variant="words" />;
}
