/**
 * The question family under the ONE-BEHAVIOUR RULE (plan
 * `20260924-activity-type-one-behavior-rule`, ADR-1 + ADR-3 + ADR-9, T14).
 *
 * `question` switched between one pick and many on `mode`, and `allow_other`
 * added in-place free typing ("Outro") next to the options. Each kind below
 * pins ONE input on the shared `QuestionView`:
 *
 * | kind                 | input               | "Outro" | notes box |
 * |----------------------|---------------------|---------|-----------|
 * | `question_pick_one`  | pick one option     | no      | no        |
 * | `question_pick_many` | pick any number     | no      | no        |
 * | `question_write`     | type a free answer  | no      | yes (the whole input) |
 *
 * ADR-9: "Outro" is a CALLER option of the transition kind `question`
 * (`callerOptions`), never of these kinds. They take no `callerOptions`, so no
 * host can put free text back into a pick kind. None of them grades, and none
 * is stored in `itera.activities` (no enum label).
 */
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import { QuestionView } from '../QuestionActivity.js';
import { KindSpecGate } from './KindSpecGate.js';

type QuestionKindProps = {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  priorAnswer?: ActivityCompletion;
};

export function QuestionPickOneActivity({ activity, onComplete, priorAnswer }: QuestionKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <QuestionView
        activity={activity}
        onComplete={onComplete}
        priorAnswer={priorAnswer}
        multi={false}
        withOptions
        allowOther={false}
        allowNotes={false}
        pickHint="options-only"
      />
    </KindSpecGate>
  );
}

export function QuestionPickManyActivity({ activity, onComplete, priorAnswer }: QuestionKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <QuestionView
        activity={activity}
        onComplete={onComplete}
        priorAnswer={priorAnswer}
        multi
        withOptions
        allowOther={false}
        allowNotes={false}
        pickHint="options-only"
      />
    </KindSpecGate>
  );
}

export function QuestionWriteActivity({ activity, onComplete, priorAnswer }: QuestionKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <QuestionView
        activity={activity}
        onComplete={onComplete}
        priorAnswer={priorAnswer}
        multi={false}
        withOptions={false}
        allowOther={false}
        allowNotes
        pickHint="none"
      />
    </KindSpecGate>
  );
}
