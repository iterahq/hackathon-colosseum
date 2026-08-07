/**
 * SandboxAIWithOptions — the learner adds context by picking ONE choice chip
 * (`scenario.choices`), sends, then rates the answer. Its authoring shape is a
 * base prompt plus a set of context choices. Delegates the chat/reveal scaffold
 * to `SandboxScenarioShell`.
 */
import { SandboxScenarioShell } from './SandboxScenarioShell.js';
import type { PortableActivity } from '../../renderer.js';

export function SandboxAIWithOptionsActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  return <SandboxScenarioShell activity={activity} onComplete={onComplete} reveal={reveal} variant="options" />;
}
