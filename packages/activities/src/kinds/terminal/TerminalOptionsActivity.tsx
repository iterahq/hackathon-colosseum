/**
 * TerminalWithOptions — the learner picks from a palette at the bottom of the
 * screen instead of typing: whole commands (one tap sends) or tokens to
 * assemble, authorable per step.
 *
 * Same spec, same steps, same matcher, same trace shape as the free-text type —
 * the ONLY difference is the input surface. Switching a published activity
 * between the two is editing `spec.inputMode`.
 * Delegates the whole scaffold to `TerminalSandboxShell`.
 */
import { TerminalSandboxShell } from './TerminalSandboxShell.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';

export function TerminalOptionsActivity({
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
      variant="options"
    />
  );
}
