/**
 * SingleChoice — multiple choice, exactly ONE correct (plan: ≈ MC). Pick one
 * option, submit, and `onComplete(selected === correct)`. Options can carry a
 * text label, an image, and/or an audio clip. Converges on the shared
 * InstructionPanel + `onComplete(correct)` contract.
 *
 * NO story-only seams. The answered / correct / incorrect states are reached by
 * CLICKING — in Storybook (`play`) and in Vitest (portable stories), from the
 * same story definition. Plan `20260728-itera-activity-testing`, ADR-4: a state
 * reachable by a prop but not by a real user is a false green.
 *
 * `priorAnswer` does not break that rule and is not an exception to it. It
 * replays the option THIS activity handed up in an earlier session, and the
 * verdict is then re-derived by the same `selected === correct_option_id` below
 * that a live click produces — so every state it can reach is a state a learner
 * really produced. The full argument is in `../internal/priorAnswer.ts`.
 */
import { useRef, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ChoiceOption, SingleChoiceSpec } from '../specs.js';
import { learnerOptionOrder } from '../internal/shuffle.js';
import { useLearnerScope } from '../internal/useLearnerScope.js';
import {
  useActivityActionRecorder,
  type SelectionAction,
} from '../internal/actionRecorder.js';
import { answerMachine, choiceOptionState } from '../internal/answerMachine.js';
import { priorOptionIds } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, SubmitButton } from '../components/parts.js';
import { ChoiceOptionCard } from '../components/ChoiceOptionCard.js';
import { useChoiceHotkeys } from '../components/useChoiceHotkeys.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      )}
      {option.label && <span className="flex-1 min-w-0 whitespace-normal break-words">{option.label}</span>}
      {option.audio_url && (
        <audio
          src={option.audio_url}
          controls
          className="h-8 max-w-[10rem]"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export function SingleChoiceActivity({
  activity,
  onComplete,
  reveal = false,
  priorAnswer,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
  priorAnswer?: ActivityCompletion;
}) {
  const { t } = useActivityI18n();
  // The learner half of the shuffle seed, injected by the host (ADR-3):
  // it used to be read straight out of the Player's localStorage.
  const scope = useLearnerScope();
  const spec = activity.spec as unknown as SingleChoiceSpec;
  // Per-LEARNER, per-ACTIVITY order: stable across remounts for one learner,
  // different between learners (../internal/shuffle.ts). Reference-only labels
  // (`A`, `B`, `C` for the instruction's blocks) keep the authored order.
  const [options] = useState(() => learnerOptionOrder(spec?.options ?? [], scope, activity.id));
  // The learner's own earlier pick, replayed. Read ONCE, against the AUTHORED
  // ids — an option the spec does not declare restores nothing
  // (../internal/priorAnswer.ts). `null` when there is nothing to replay, which
  // is the exact state a fresh mount had before this existed.
  const [restoredSelection] = useState<string | null>(() => {
    const ids = priorOptionIds(priorAnswer, (spec?.options ?? []).map((o) => o.id));
    // EXACTLY one. This kind submits exactly one id, so a payload with two is
    // some other kind's trace — and quietly taking the first would show a pick
    // the learner never made on this screen.
    return ids && ids.length === 1 ? ids[0] : null;
  });
  const [selected, setSelected] = useState<string | null>(restoredSelection);
  const [submitted, setSubmitted] = useState(false);
  // The `selection` family's action sequence (sub-plan 1, Fase A). Ref-backed:
  // recording an option change must not re-render the option grid.
  const trace = useActivityActionRecorder<SelectionAction>(activity.id);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isCorrect = selected === spec?.correct_option_id;
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    // A replayed pick makes the earlier answer KNOWN, which is the one thing a
    // `done` render was missing. The machine still refuses to grade unless the
    // activity is `done`, so this cannot settle a fresh one.
    restored: restoredSelection !== null,
    correct: isCorrect,
    hasAnswer: selected !== null,
  });

  // ONE-STEP: "Enviar" grades AND completes in the same click (no second
  // "Marcar como concluída" step). Grade off the CURRENT selection — the
  // machine's `gradeResult` is gated on `submitted`, which isn't set yet here.
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the chosen option up as text. It is DROPPED unless the author set
    // this activity to persist (artifact_policy.mode = 'always') — see
    // src/services/artifactPolicy.ts.
    const chosen = options.find((o) => o.id === selected);
    trace.record('answer_submitted', { option_ids: selected ? [selected] : [] });
    onComplete(isCorrect, {
      response: chosen?.label ?? chosen?.id ?? '',
      // The HOW rides beside the WHAT. Every re-pick before this click is in
      // here, which is the difference between "got it right" and "got it right
      // after changing their mind twice".
      actions: trace.drain(),
    });
  }

  function pick(id: string) {
    // The AUTHORED id, never the post-shuffle index: the order is
    // per-learner, so a position would not be comparable across
    // learners — and cross-learner comparison is the whole point.
    trace.record('option_selected', { option_id: id });
    setSelected(id);
  }

  const optionsRef = useRef<HTMLDivElement>(null);
  useChoiceHotkeys({
    scope: optionsRef,
    count: options.length,
    enabled: !m.locked,
    onPick: (i) => pick(options[i].id),
    onSubmit: () => {
      if (!m.submitDisabled) handleSubmit();
    },
  });

  return (
    <ActivityShell kind="single_choice" icon={ListChecks} label={t('activity.singleChoice')}>
      <InstructionPanel spec={spec?.instruction} />

      <div ref={optionsRef} className="mt-5 grid gap-2.5 auto-rows-fr" data-testid="single-choice-options">
        {options.map((o, i) => {
          const chosen = selected === o.id;
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: o.id === spec?.correct_option_id,
          });
          return (
            <ChoiceOptionCard
              key={o.id}
              index={i}
              state={state}
              chosen={chosen}
              shown={m.shown}
              disabled={m.locked}
              onClick={() => pick(o.id)}
              testId="single-choice-option"
              // The AUTHORED id — what grading keys on, and what a learning
              // event must reference. NOT the post-shuffle position, which
              // differs per learner and per mount.
              optionId={o.id}
            >
              <OptionMedia option={o} />
            </ChoiceOptionCard>
          );
        })}
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('activity.noOptions')}</p>
        )}
      </div>

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} />

      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="single-choice-submit"
      />
    </ActivityShell>
  );
}
