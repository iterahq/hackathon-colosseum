/**
 * SandboxAICompleteWords — the learner assembles the prompt by filling slots
 * (`scenario.slots`: select chips or free text), sends, then rates the answer.
 * Its authoring shape is a base prompt with typed slots to complete. Delegates
 * the chat/reveal scaffold to `SandboxScenarioShell`.
 */
import type { Activity } from '@/types/content';
import { SandboxScenarioShell } from './sandbox/SandboxScenarioShell';

export function SandboxAICompleteWordsActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  return <SandboxScenarioShell activity={activity} onComplete={onComplete} reveal={reveal} variant="words" />;
}
