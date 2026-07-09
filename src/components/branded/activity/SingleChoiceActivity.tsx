/**
 * SingleChoice — multiple choice, exactly ONE correct (plan: ≈ MC). Pick one
 * option, submit, and `onComplete(selected === correct)`. Options can carry a
 * text label, an image, and/or an audio clip. Converges on the shared
 * InstructionPanel + `onComplete(correct)` contract.
 *
 * The `initial*` props are story-only hooks to render the answered / correct /
 * incorrect states directly (Storybook has no interactions addon here).
 */
import { useState } from 'react';
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, SingleChoiceSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, SubmitButton } from './parts';

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      )}
      {option.label && <span className="flex-1 min-w-0">{option.label}</span>}
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
  initialSelectedId,
  initialSubmitted = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  initialSelectedId?: string;
  initialSubmitted?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as SingleChoiceSpec;
  const options = spec?.options ?? [];
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const isDone = activity.status === 'done';

  // ONE-STEP: "Enviar" grades AND completes in the same click (no second
  // "Marcar como concluída" step). Grade off the CURRENT selection — `isCorrect`
  // above is gated on `submitted`, which isn't set yet at click time.
  function handleSubmit() {
    if (submitted || isDone) return;
    setSubmitted(true);
    onComplete(selected === spec?.correct_option_id);
  }

  return (
    <ActivityShell kind="single_choice" icon={ListChecks} label={t('activity.singleChoice')}>
      <InstructionPanel spec={spec?.instruction} />

      <div className="mt-5 space-y-2.5" data-testid="single-choice-options">
        {options.map((o) => {
          const chosen = selected === o.id;
          const showCorrect = submitted && o.id === spec?.correct_option_id;
          const showWrong = submitted && chosen && o.id !== spec?.correct_option_id;
          return (
            <button
              key={o.id}
              disabled={submitted || isDone}
              onClick={() => setSelected(o.id)}
              data-testid="single-choice-option"
              data-selected={chosen ? 'true' : undefined}
              className={`w-full flex items-center gap-3 py-4 px-5 rounded-2xl border text-left transition-colors ${
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

      <SubmitButton
        submitted={submitted || isDone}
        disabled={selected === null}
        onSubmit={handleSubmit}
        testId="single-choice-submit"
      />
    </ActivityShell>
  );
}
