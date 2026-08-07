/**
 * TerminalFreeText — the learner TYPES the command and presses Enter. The
 * superset of the two terminal types: the options mode can only ever produce
 * strings this mode also accepts, which is why it was built first — it is the
 * one that actually exercises the normalizer and the matcher.
 * Delegates the whole scaffold to `TerminalSandboxShell`.
 */
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { TerminalSandboxShell } from './TerminalSandboxShell';

export function TerminalFreeTextActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  return (
    <TerminalSandboxShell
      activity={activity}
      onComplete={onComplete}
      reveal={reveal}
      variant="freeText"
    />
  );
}
