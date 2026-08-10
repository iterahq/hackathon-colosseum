/**
 * `terminal_sandbox` — the shell sandbox, split again by `spec.inputMode`:
 *   · `options`  → TerminalWithOptions (palette at the bottom of the screen)
 *   · otherwise  → TerminalFreeText    (type it and press Enter)
 *
 * The two input modes are ONE kind on purpose (plan ADR-2): two kinds would mean
 * two notions of "correct" that can drift, and the same authored content grading
 * differently depending on which surface the learner was given.
 */
import type { TerminalScenario } from '@iterahq/activity-spec/runtime';
import { TerminalFreeTextActivity } from './terminal/TerminalFreeTextActivity.js';
import { TerminalOptionsActivity } from './terminal/TerminalOptionsActivity.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

export function TerminalSandboxActivity(props: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
}) {
  const terminal = props.activity.spec as unknown as TerminalScenario;
  if (terminal.inputMode === 'options') return <TerminalOptionsActivity {...props} />;
  return <TerminalFreeTextActivity {...props} />;
}
