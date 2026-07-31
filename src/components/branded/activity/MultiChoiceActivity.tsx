/**
 * MultiChoice — multiple choice, one-or-MORE correct (plan: ≈ MC v2). Toggle
 * any number of options, submit, and complete correct only when the selected
 * SET exactly equals `correct_option_ids`. Reuses the InstructionPanel + the
 * `onComplete(correct)` contract.
 *
 * NO story-only seams (ADR-4): answered/correct/incorrect are reached by
 * clicking, from the story's own `play`.
 */
import { useState } from 'react';
import { Check, CheckCircle2, CheckSquare, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, MultiChoiceSpec } from '@/types/content';
import { learnerShuffle } from '@/utils/learnerShuffle';
import { answerMachine, choiceOptionState } from '@/utils/answerMachine';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, AnswerExplanation, SubmitButton } from './parts';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-start gap-3 flex-1 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      )}
      {option.label && <span className="flex-1 min-w-0 whitespace-normal break-words">{option.label}</span>}
      {option.audio_url && (
        <audio src={option.audio_url} controls className="h-8 max-w-[10rem]" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

export function MultiChoiceActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as MultiChoiceSpec;
  // Per-LEARNER, per-ACTIVITY order: stable across remounts for one learner,
  // different between learners (src/utils/learnerShuffle.ts).
  const [options] = useState(() => learnerShuffle(spec?.options ?? [], activity.id));
  const correctIds = spec?.correct_option_ids ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (src/utils/answerMachine.ts — one definition, six call sites).
  const isCorrect = sameSet(selected, correctIds);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    correct: isCorrect,
    hasAnswer: selected.length > 0,
  });

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ONE-STEP: "Enviar" grades AND completes in the same click. Grade off the
  // CURRENT selection (the machine's `gradeResult` isn't set yet at click time).
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the chosen options up as text (see SingleChoiceActivity for why this
    // does not, on its own, cause a write).
    // Iterate `selected` (click order), NOT `options` — `options` is per-learner
    // SHUFFLED, so mapping over it would make the artifact's contents depend on
    // a random seed. Click order is deterministic and is also the more faithful
    // record of what the learner actually did.
    const chosen = selected
      .map((id) => `- ${options.find((o) => o.id === id)?.label ?? id}`)
      .join('\n');
    onComplete(isCorrect, { response: chosen });
  }

  return (
    <ActivityShell kind="multi_choice" icon={CheckSquare} label={t('activity.multiChoice')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.selectAll')}
      </p>

      <div className="mt-3 grid gap-2.5 auto-rows-fr" data-testid="multi-choice-options">
        {options.map((o) => {
          const chosen = selected.includes(o.id);
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: correctIds.includes(o.id),
          });
          const showCorrect = state === 'correct';
          const showWrong = state === 'wrong';
          return (
            <button
              key={o.id}
              disabled={m.locked}
              onClick={() => toggle(o.id)}
              data-testid="multi-choice-option"
              // The AUTHORED id — see SingleChoiceActivity for why the index is
              // not an acceptable substitute.
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
              <span
                className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                  chosen ? 'border-menta bg-menta/20' : 'border-muted-foreground/40'
                }`}
              >
                {chosen && <Check className="w-3.5 h-3.5 text-menta" />}
              </span>
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
        testId="multi-choice-submit"
      />
    </ActivityShell>
  );
}
