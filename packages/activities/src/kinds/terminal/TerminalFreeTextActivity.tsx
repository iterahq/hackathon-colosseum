/**
 * TerminalFreeText — the learner TYPES the command and presses Enter. The
 * superset of the two terminal types: the options mode can only ever produce
 * strings this mode also accepts, which is why it was built first — it is the
 * one that actually exercises the normalizer and the matcher.
 * Delegates the whole scaffold to `TerminalSandboxShell`.
 */
import { TerminalSandboxShell } from './TerminalSandboxShell.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';

export function TerminalFreeTextActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
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
