/**
 * SandboxAI — the open sandbox chat: the learner composes a free prompt (no
 * context builder), sends it, then rates the answer. The simplest of the three
 * sandbox types — its spec carries neither `slots` nor `choices`. Delegates the
 * chat/reveal scaffold to `SandboxScenarioShell`.
 */
import type { Activity } from '@/types/content';
import { SandboxScenarioShell } from './sandbox/SandboxScenarioShell';

export function SandboxAIActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  return <SandboxScenarioShell activity={activity} onComplete={onComplete} reveal={reveal} variant="ai" />;
}
