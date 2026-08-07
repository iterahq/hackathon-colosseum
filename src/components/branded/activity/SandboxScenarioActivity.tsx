/**
 * SandboxScenario dispatcher — the `sandbox_scenario` kind splits into activity
 * types that differ only by how the learner composes their turn. We pick the
 * concrete component off the scenario's authoring shape, never off a second
 * enum value.
 *
 * FIRST, by `sandboxKind` — the two sandboxes have different world models and
 * different `initialState` shapes:
 *   - `terminal` → the terminal sandbox, then split again by `spec.inputMode`:
 *       · `options`  → TerminalWithOptions (palette at the bottom of the screen)
 *       · otherwise  → TerminalFreeText    (type it and press Enter)
 *   - anything else → the chat sandbox (`cloud-core-chat`), split by shape:
 *       · `slots`   → SandboxAICompleteWords (fill-in slots)
 *       · `choices` → SandboxAIWithOptions   (pick a context chip)
 *       · neither   → SandboxAI              (open free compose)
 *
 * The terminal is ONE `sandboxKind` with an `inputMode` field rather than two
 * (plan ADR-2). Two kinds would mean two notions of "correct" that can drift,
 * and the same authored content grading differently depending on which surface
 * the learner was given. With one kind, the matcher is literally the same code
 * and the options mode only narrows the input space before it runs.
 *
 * Kept at the original name/path so `ActivityRenderer` dispatches unchanged.
 */
import type { Scenario, TerminalScenario } from '@iterahq/activity-spec/runtime';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';
import { SandboxAIActivity } from './SandboxAIActivity';
import { SandboxAIWithOptionsActivity } from './SandboxAIWithOptionsActivity';
import { SandboxAICompleteWordsActivity } from './SandboxAICompleteWordsActivity';
import { TerminalFreeTextActivity } from './terminal/TerminalFreeTextActivity';
import { TerminalOptionsActivity } from './terminal/TerminalOptionsActivity';

export function SandboxScenarioActivity(props: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  const spec = props.activity.spec as unknown as Scenario | TerminalScenario;

  if (spec.sandboxKind === 'terminal') {
    const terminal = spec as TerminalScenario;
    if (terminal.inputMode === 'options') return <TerminalOptionsActivity {...props} />;
    return <TerminalFreeTextActivity {...props} />;
  }

  const scenario = spec as Scenario;
  if (scenario.slots?.length) return <SandboxAICompleteWordsActivity {...props} />;
  if (scenario.choices?.length) return <SandboxAIWithOptionsActivity {...props} />;
  return <SandboxAIActivity {...props} />;
}
