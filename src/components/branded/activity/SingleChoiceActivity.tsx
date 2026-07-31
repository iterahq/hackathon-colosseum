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
 */
import { useState } from 'react';
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, SingleChoiceSpec } from '@/types/content';
import { learnerShuffle } from '@/utils/learnerShuffle';
import { answerMachine, choiceOptionState } from '@/utils/answerMachine';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, AnswerExplanation, SubmitButton } from './parts';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-start gap-3 flex-1 min-w-0">
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
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as SingleChoiceSpec;
  // Per-LEARNER, per-ACTIVITY order: stable across remounts for one learner,
  // different between learners (src/utils/learnerShuffle.ts).
  const [options] = useState(() => learnerShuffle(spec?.options ?? [], activity.id));
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (src/utils/answerMachine.ts — one definition, six call sites).
  const isCorrect = selected === spec?.correct_option_id;
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
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
    onComplete(isCorrect, { response: chosen?.label ?? chosen?.id ?? '' });
  }

  return (
    <ActivityShell kind="single_choice" icon={ListChecks} label={t('activity.singleChoice')}>
      <InstructionPanel spec={spec?.instruction} />

      <div className="mt-5 grid gap-2.5 auto-rows-fr" data-testid="single-choice-options">
        {options.map((o) => {
          const chosen = selected === o.id;
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: o.id === spec?.correct_option_id,
          });
          const showCorrect = state === 'correct';
          const showWrong = state === 'wrong';
          return (
            <button
              key={o.id}
              disabled={m.locked}
              onClick={() => setSelected(o.id)}
              data-testid="single-choice-option"
              // The AUTHORED id — what grading keys on, and what a learning
              // event must reference. NOT the post-shuffle position, which
              // differs per learner and per mount.
              data-option-id={o.id}
              data-selected={chosen ? 'true' : undefined}
              className={`w-full h-full flex items-start gap-3 py-4 px-5 rounded-2xl border text-left transition-colors ${
                showCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : showWrong
                    ? 'border-destructive bg-destructive/10'
                    : chosen
                      ? 'border-menta bg-menta/10'
                      : 'border-border bg-card hover:border-verde-tech/50 disabled:opacity-70'
              }`}
            >
              <OptionMedia option={o} />
              {showCorrect && <CheckCircle2 className="w-5 h-5 text-menta flex-shrink-0" />}
              {showWrong && <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />}
            </button>
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
